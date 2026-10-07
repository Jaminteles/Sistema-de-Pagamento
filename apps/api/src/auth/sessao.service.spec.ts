import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PerfilUsuario } from '@sistema/shared';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { AppConfig } from '../config/app.config';
import { MotivoRevogacao, RefreshInvalidoError, SessaoService } from './sessao.service';

const SEGREDO_ACESSO = 'segredo-de-teste-para-access-token-0001';
const SEGREDO_REFRESH = 'segredo-de-teste-para-refresh-token-002';

interface LinhaSessao {
  id: string;
  usuarioId: string;
  tokenHash: string;
  expiraEm: Date;
  revogadaEm: Date | null;
  motivo: string | null;
  usuario: { ativo: boolean; perfil: PerfilUsuario };
}

/**
 * Banco em memoria com o pedaco de sessao_refresh que o service usa.
 * Nenhum teste automatizado abre conexao real.
 */
function criarPrismaFalso(linhas: LinhaSessao[]): {
  prisma: PrismaService;
  linhas: LinhaSessao[];
} {
  const prisma = {
    sessaoRefresh: {
      create: jest.fn(({ data }: { data: Omit<LinhaSessao, 'usuario' | 'revogadaEm' | 'motivo'> }) => {
        linhas.push({
          ...data,
          revogadaEm: null,
          motivo: null,
          usuario: { ativo: true, perfil: PerfilUsuario.RH },
        });
        return Promise.resolve({ id: data.id });
      }),
      findUnique: jest.fn(({ where }: { where: { id?: string; tokenHash?: string } }) => {
        const achada = linhas.find(
          (linha) =>
            (where.id !== undefined && linha.id === where.id) ||
            (where.tokenHash !== undefined && linha.tokenHash === where.tokenHash),
        );
        return Promise.resolve(achada ?? null);
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id?: string; usuarioId?: string; revogadaEm?: null };
          data: { revogadaEm: Date; motivo: string };
        }) => {
          let afetadas = 0;
          for (const linha of linhas) {
            const casaId = where.id === undefined || linha.id === where.id;
            const casaUsuario = where.usuarioId === undefined || linha.usuarioId === where.usuarioId;
            const casaAberta = where.revogadaEm !== null || linha.revogadaEm === null;
            if (casaId && casaUsuario && casaAberta) {
              linha.revogadaEm = data.revogadaEm;
              linha.motivo = data.motivo;
              afetadas += 1;
            }
          }
          return Promise.resolve({ count: afetadas });
        },
      ),
    },
  } as unknown as PrismaService;

  return { prisma, linhas };
}

function criarConfig(): AppConfig {
  return {
    jwtAccessSecret: SEGREDO_ACESSO,
    jwtRefreshSecret: SEGREDO_REFRESH,
    jwtAccessTtlSegundos: 900,
    jwtRefreshTtlDias: 7,
  } as unknown as AppConfig;
}

describe('SessaoService', () => {
  let linhas: LinhaSessao[];
  let servico: SessaoService;

  beforeEach(() => {
    linhas = [];
    const { prisma } = criarPrismaFalso(linhas);
    servico = new SessaoService(prisma, new JwtService({}), criarConfig());
  });

  it('guarda apenas o hash do refresh token, nunca o token em claro', async () => {
    const { refreshToken, sessaoId } = await servico.criar('u-1', { ip: '203.0.113.1' });

    const linha = linhas.find((item) => item.id === sessaoId);
    expect(linha?.tokenHash).toBe(createHash('sha256').update(refreshToken).digest('hex'));
    expect(JSON.stringify(linhas)).not.toContain(refreshToken);
  });

  it('valida o refresh token da sessao aberta', async () => {
    const { refreshToken, sessaoId } = await servico.criar('u-1', {});

    await expect(servico.validar(refreshToken)).resolves.toEqual({
      sessaoId,
      usuarioId: 'u-1',
      perfil: PerfilUsuario.RH,
    });
  });

  it('recusa token com assinatura de outro segredo', async () => {
    const outro = new JwtService({});
    const forjado = await outro.signAsync({ sub: 'u-1', sid: 'qualquer' }, { secret: 'x'.repeat(40) });

    await expect(servico.validar(forjado)).rejects.toBeInstanceOf(RefreshInvalidoError);
  });

  it('rotaciona: o token anterior deixa de valer', async () => {
    const primeira = await servico.criar('u-1', {});
    const validada = await servico.validar(primeira.refreshToken);
    const segunda = await servico.rotacionar(validada.sessaoId, 'u-1', {});

    expect(segunda.refreshToken).not.toBe(primeira.refreshToken);
    await expect(servico.contextoDaSessao(primeira.sessaoId)).resolves.toBeNull();
    await expect(servico.contextoDaSessao(segunda.sessaoId)).resolves.toMatchObject({
      usuarioId: 'u-1',
      perfil: PerfilUsuario.RH,
    });
  });

  it('reusar token rotacionado revoga todas as sessoes do usuario', async () => {
    const primeira = await servico.criar('u-1', {});
    const validada = await servico.validar(primeira.refreshToken);
    const segunda = await servico.rotacionar(validada.sessaoId, 'u-1', {});

    // O atacante reapresenta o token antigo.
    await expect(servico.validar(primeira.refreshToken)).rejects.toMatchObject({ motivo: 'reuso' });

    // A sessao legitima tambem cai: o cookie vazou.
    await expect(servico.contextoDaSessao(segunda.sessaoId)).resolves.toBeNull();
    expect(linhas.every((linha) => linha.motivo !== null)).toBe(true);
    expect(linhas.some((linha) => linha.motivo === MotivoRevogacao.REUSO)).toBe(true);
  });

  it('recusa sessao expirada', async () => {
    const { refreshToken, sessaoId } = await servico.criar('u-1', {});
    const linha = linhas.find((item) => item.id === sessaoId);
    if (linha) {
      linha.expiraEm = new Date(Date.now() - 1000);
    }

    await expect(servico.validar(refreshToken)).rejects.toMatchObject({ motivo: 'expirado' });
  });

  it('recusa e revoga quando o usuario foi desativado', async () => {
    const { refreshToken, sessaoId } = await servico.criar('u-1', {});
    const linha = linhas.find((item) => item.id === sessaoId);
    if (linha) {
      linha.usuario.ativo = false;
    }

    await expect(servico.validar(refreshToken)).rejects.toMatchObject({ motivo: 'inativo' });
    await expect(servico.contextoDaSessao(sessaoId)).resolves.toBeNull();
  });

  it('contextoDaSessao devolve o perfil atual do banco', async () => {
    const { sessaoId } = await servico.criar('u-1', {});
    const linha = linhas.find((item) => item.id === sessaoId);
    if (linha) {
      linha.usuario.perfil = PerfilUsuario.FINANCEIRO;
    }

    await expect(servico.contextoDaSessao(sessaoId)).resolves.toMatchObject({
      perfil: PerfilUsuario.FINANCEIRO,
    });
  });

  it('contextoDaSessao devolve null para sessao inexistente', async () => {
    await expect(servico.contextoDaSessao('nao-existe')).resolves.toBeNull();
  });

  it('logout encerra a sessao no servidor', async () => {
    const { sessaoId } = await servico.criar('u-1', {});

    await servico.revogar(sessaoId, MotivoRevogacao.LOGOUT);

    await expect(servico.contextoDaSessao(sessaoId)).resolves.toBeNull();
    expect(linhas[0]?.motivo).toBe(MotivoRevogacao.LOGOUT);
  });
});
