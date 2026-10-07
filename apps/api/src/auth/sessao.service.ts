import { createHash, randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PerfilUsuario } from '@sistema/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppConfig } from '../config/app.config';
import type { OrigemRequisicao } from '../common/auditoria/auditoria.types';

/** Motivos de revogacao gravados em sessao_refresh.motivo. Sem dado pessoal. */
export const MotivoRevogacao = {
  ROTACAO: 'ROTACAO',
  LOGOUT: 'LOGOUT',
  REUSO: 'REUSO',
  SENHA: 'SENHA',
  USUARIO_INATIVO: 'USUARIO_INATIVO',
} as const;

export type MotivoRevogacao = (typeof MotivoRevogacao)[keyof typeof MotivoRevogacao];

/** Claims do refresh token. Nao carrega nome, e-mail nem perfil. */
interface RefreshTokenPayload {
  sub: string;
  sid: string;
}

export interface SessaoCriada {
  sessaoId: string;
  refreshToken: string;
}

export interface SessaoValidada {
  sessaoId: string;
  usuarioId: string;
  perfil: PerfilUsuario;
}

/** Resultado de uma validacao de refresh que nao pode prosseguir. */
export class RefreshInvalidoError extends Error {
  constructor(readonly motivo: 'invalido' | 'expirado' | 'revogado' | 'reuso' | 'inativo') {
    super(`Refresh token ${motivo}.`);
    this.name = 'RefreshInvalidoError';
  }
}

/** SHA-256 em hexadecimal: e o que vai para o banco, nunca o token em claro. */
function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Ciclo de vida das sessoes de refresh (RF-001).
 *
 * O token em claro existe somente no cookie httpOnly do navegador. O banco
 * guarda o hash, a validade e a revogacao, o que permite logout de verdade,
 * rotacao a cada renovacao e deteccao de reuso de token vazado.
 */
@Injectable()
export class SessaoService {
  private readonly logger = new Logger(SessaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  /** Cria uma sessao e devolve o refresh token que vai para o cookie. */
  async criar(usuarioId: string, origem: OrigemRequisicao): Promise<SessaoCriada> {
    const expiraEm = new Date(Date.now() + this.config.jwtRefreshTtlDias * 24 * 60 * 60 * 1000);

    // O id e gerado aqui porque entra nas claims do token, e o hash do token
    // precisa ser gravado na mesma linha da sessao.
    const sessaoId = randomUUID();
    const refreshToken = await this.assinarRefresh(usuarioId, sessaoId);

    await this.prisma.sessaoRefresh.create({
      data: {
        id: sessaoId,
        usuarioId,
        tokenHash: hashDoToken(refreshToken),
        expiraEm,
        ip: origem.ip ?? null,
        userAgent: origem.userAgent?.slice(0, 255) ?? null,
      },
      select: { id: true },
    });

    return { sessaoId, refreshToken };
  }

  /**
   * Valida o refresh token recebido no cookie.
   *
   * Reuso de um token de sessao ja revogada revoga todas as sessoes do usuario:
   * e o sinal de que o cookie vazou.
   */
  async validar(token: string): Promise<SessaoValidada> {
    const payload = await this.verificarRefresh(token);

    const sessao = await this.prisma.sessaoRefresh.findUnique({
      where: { tokenHash: hashDoToken(token) },
      select: {
        id: true,
        usuarioId: true,
        expiraEm: true,
        revogadaEm: true,
        usuario: { select: { ativo: true, perfil: true } },
      },
    });

    if (!sessao || sessao.usuarioId !== payload.sub || sessao.id !== payload.sid) {
      throw new RefreshInvalidoError('invalido');
    }

    if (sessao.revogadaEm) {
      this.logger.warn(`Reuso de refresh token na sessao ${sessao.id}. Revogando o usuario.`);
      await this.revogarTodasDoUsuario(sessao.usuarioId, MotivoRevogacao.REUSO);
      throw new RefreshInvalidoError('reuso');
    }

    if (sessao.expiraEm.getTime() <= Date.now()) {
      await this.revogar(sessao.id, MotivoRevogacao.ROTACAO);
      throw new RefreshInvalidoError('expirado');
    }

    if (!sessao.usuario.ativo) {
      await this.revogarTodasDoUsuario(sessao.usuarioId, MotivoRevogacao.USUARIO_INATIVO);
      throw new RefreshInvalidoError('inativo');
    }

    return { sessaoId: sessao.id, usuarioId: sessao.usuarioId, perfil: sessao.usuario.perfil };
  }

  /** Revoga a sessao atual e abre outra: o refresh token nunca e reaproveitado. */
  async rotacionar(sessaoId: string, usuarioId: string, origem: OrigemRequisicao): Promise<SessaoCriada> {
    await this.revogar(sessaoId, MotivoRevogacao.ROTACAO);
    return await this.criar(usuarioId, origem);
  }

  async revogar(sessaoId: string, motivo: MotivoRevogacao): Promise<void> {
    await this.prisma.sessaoRefresh.updateMany({
      where: { id: sessaoId, revogadaEm: null },
      data: { revogadaEm: new Date(), motivo },
    });
  }

  /** Usada no logout de todas as sessoes, na troca de senha e na desativacao. */
  async revogarTodasDoUsuario(usuarioId: string, motivo: MotivoRevogacao): Promise<void> {
    await this.prisma.sessaoRefresh.updateMany({
      where: { usuarioId, revogadaEm: null },
      data: { revogadaEm: new Date(), motivo },
    });
  }

  /**
   * Identidade por tras de um access token, usada pelo JwtAuthGuard.
   *
   * Uma unica consulta resolve "a sessao continua valida?" e "qual o perfil
   * atual do usuario?". Devolve null quando a sessao caiu (logout, troca de
   * senha, reuso) ou quando a conta foi desativada - nos dois casos o access
   * token para de valer na hora, sem esperar a expiracao.
   *
   * O perfil vem do banco, nunca da claim do token: mudanca de perfil vale ja
   * na requisicao seguinte.
   */
  async contextoDaSessao(sessaoId: string): Promise<SessaoValidada | null> {
    const sessao = await this.prisma.sessaoRefresh.findUnique({
      where: { id: sessaoId },
      select: {
        revogadaEm: true,
        expiraEm: true,
        usuarioId: true,
        usuario: { select: { ativo: true, perfil: true } },
      },
    });

    if (!sessao || sessao.revogadaEm || sessao.expiraEm.getTime() <= Date.now()) {
      return null;
    }

    if (!sessao.usuario.ativo) {
      return null;
    }

    return { sessaoId, usuarioId: sessao.usuarioId, perfil: sessao.usuario.perfil };
  }

  private async assinarRefresh(usuarioId: string, sessaoId: string): Promise<string> {
    const payload: RefreshTokenPayload = { sub: usuarioId, sid: sessaoId };
    return await this.jwt.signAsync(payload, {
      secret: this.config.jwtRefreshSecret,
      expiresIn: `${this.config.jwtRefreshTtlDias}d`,
    });
  }

  private async verificarRefresh(token: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.jwtRefreshSecret,
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new RefreshInvalidoError('invalido');
      }
      return payload;
    } catch (erro) {
      if (erro instanceof RefreshInvalidoError) {
        throw erro;
      }
      // Assinatura invalida ou token expirado: a mensagem do jsonwebtoken nunca
      // chega ao cliente.
      throw new RefreshInvalidoError('invalido');
    }
  }
}
