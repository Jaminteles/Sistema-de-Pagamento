import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  type AccessTokenPayload,
  type PerfilUsuario,
  type SessaoResponse,
  type UsuarioAutenticado,
} from '@sistema/shared';
import type { OrigemRequisicao } from '../common/auditoria/auditoria.types';
import type { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import { conferirSenha, gerarHashSenha } from '../common/crypto/password.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppConfig } from '../config/app.config';
import type { LoginDto } from './dto/login.dto';
import type { TrocarSenhaDto } from './dto/trocar-senha.dto';
import { MotivoRevogacao, RefreshInvalidoError, SessaoService } from './sessao.service';

/**
 * Hash descartavel usado quando o e-mail nao existe.
 *
 * Conferir um hash de verdade mesmo sem usuario mantem o tempo de resposta
 * parecido nos dois casos e evita descobrir quais e-mails estao cadastrados.
 * Gerado uma unica vez, sob demanda, a partir de bytes aleatorios: a senha que
 * o originou nao existe em lugar nenhum.
 */
let hashFalso: Promise<string> | null = null;

function hashDeComparacao(): Promise<string> {
  hashFalso ??= gerarHashSenha(randomBytes(24).toString('base64url'));
  return hashFalso;
}

/** Mensagem unica de falha de login: nunca diz se o e-mail existe. */
const CREDENCIAIS_INVALIDAS = 'E-mail ou senha invalidos.';
const SESSAO_EXPIRADA = 'Sessao expirada. Faca login novamente.';

/** Resultado interno do login e do refresh: o refresh token vai para o cookie. */
export interface SessaoComRefresh {
  sessao: SessaoResponse;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessoes: SessaoService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  /**
   * RF-001: login com e-mail e senha.
   *
   * Usuario inexistente, senha errada e usuario inativo devolvem exatamente o
   * mesmo erro, para nao revelar quais contas existem.
   */
  async login(
    dto: LoginDto,
    origem: OrigemRequisicao,
    coletor: ColetorAuditoria,
  ): Promise<SessaoComRefresh> {
    const email = dto.email.trim().toLowerCase();

    const usuario = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true, perfil: true, ativo: true, senhaHash: true },
    });

    const senhaConfere = await conferirSenha(
      usuario?.senhaHash ?? (await hashDeComparacao()),
      dto.senha,
    );

    if (!usuario || !senhaConfere || !usuario.ativo) {
      // Sem e-mail nem senha no log: apenas o resultado.
      this.logger.warn(
        `Tentativa de login recusada (conta ${usuario ? 'conhecida' : 'desconhecida'}).`,
      );
      throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);
    }

    const criada = await this.sessoes.criar(usuario.id, origem);

    // RF-005: quem grava o log e o AuditoriaInterceptor, no caminho de sucesso.
    coletor.anotar({
      usuarioId: usuario.id,
      entidadeId: usuario.id,
      depois: { perfil: usuario.perfil },
    });

    return await this.montarSessao(criada.sessaoId, criada.refreshToken, usuario.id, usuario.perfil);
  }

  /** RF-001: renovacao de sessao. Rotaciona o refresh token a cada chamada. */
  async refresh(refreshToken: string | null, origem: OrigemRequisicao): Promise<SessaoComRefresh> {
    if (!refreshToken) {
      throw new UnauthorizedException(SESSAO_EXPIRADA);
    }

    let validada;
    try {
      validada = await this.sessoes.validar(refreshToken);
    } catch (erro) {
      if (erro instanceof RefreshInvalidoError) {
        throw new UnauthorizedException(SESSAO_EXPIRADA);
      }
      throw erro;
    }

    const rotacionada = await this.sessoes.rotacionar(validada.sessaoId, validada.usuarioId, origem);

    return await this.montarSessao(
      rotacionada.sessaoId,
      rotacionada.refreshToken,
      validada.usuarioId,
      validada.perfil,
    );
  }

  /** Encerra a sessao no servidor, nao apenas no navegador. */
  async logout(sessaoId: string): Promise<void> {
    await this.sessoes.revogar(sessaoId, MotivoRevogacao.LOGOUT);
  }

  /** RF-004: troca de senha pelo proprio usuario. */
  async trocarSenha(
    usuarioId: string,
    dto: TrocarSenhaDto,
    coletor: ColetorAuditoria,
  ): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, senhaHash: true },
    });

    if (!usuario) {
      throw new UnauthorizedException(SESSAO_EXPIRADA);
    }

    if (!(await conferirSenha(usuario.senhaHash, dto.senhaAtual))) {
      throw new UnauthorizedException('A senha atual nao confere.');
    }

    if (dto.novaSenha === dto.senhaAtual) {
      throw new BadRequestException('A nova senha precisa ser diferente da atual.');
    }

    const senhaHash = await gerarHashSenha(dto.novaSenha);

    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { senhaHash, senhaAlteradaEm: new Date() },
      select: { id: true },
    });

    // Trocar a senha encerra as sessoes abertas, inclusive a atual.
    await this.sessoes.revogarTodasDoUsuario(usuarioId, MotivoRevogacao.SENHA);

    coletor.anotar({ entidadeId: usuarioId, depois: { redefinidaPor: 'PROPRIO_USUARIO' } });
  }

  /** Dados do usuario autenticado, para GET /api/auth/eu e para o login. */
  async usuarioAutenticado(usuarioId: string): Promise<UsuarioAutenticado> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        ativo: true,
        obras: { select: { obraId: true } },
      },
    });

    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException(SESSAO_EXPIRADA);
    }

    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      obrasIds: usuario.obras.map((vinculo) => vinculo.obraId),
    };
  }

  private async montarSessao(
    sessaoId: string,
    refreshToken: string,
    usuarioId: string,
    perfil: PerfilUsuario,
  ): Promise<SessaoComRefresh> {
    const payload: AccessTokenPayload = { sub: usuarioId, perfil, sid: sessaoId };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.jwtAccessSecret,
      expiresIn: this.config.jwtAccessTtlSegundos,
    });

    return {
      sessao: {
        accessToken,
        expiraEmSegundos: this.config.jwtAccessTtlSegundos,
        usuario: await this.usuarioAutenticado(usuarioId),
      },
      refreshToken,
    };
  }
}
