import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type AccessTokenPayload, PerfilUsuario } from '@sistema/shared';
import { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import { gerarHashSenha } from '../common/crypto/password.util';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { AppConfig } from '../config/app.config';
import { AuthService } from './auth.service';
import { MotivoRevogacao, RefreshInvalidoError, type SessaoService } from './sessao.service';

const SEGREDO_ACESSO = 'segredo-de-teste-para-access-token-0001';
const SENHA_VALIDA = 'senha-de-teste-123';

interface LinhaUsuario {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  senhaHash: string;
}

describe('AuthService', () => {
  const jwt = new JwtService({});
  let usuarios: LinhaUsuario[];
  let update: jest.Mock;
  let sessoes: {
    criar: jest.Mock;
    validar: jest.Mock;
    rotacionar: jest.Mock;
    revogar: jest.Mock;
    revogarTodasDoUsuario: jest.Mock;
    estaAtiva: jest.Mock;
  };
  let servico: AuthService;
  let coletor: ColetorAuditoria;

  const config = {
    jwtAccessSecret: SEGREDO_ACESSO,
    jwtRefreshSecret: 'segredo-de-teste-para-refresh-token-002',
    jwtAccessTtlSegundos: 900,
    jwtRefreshTtlDias: 7,
  } as unknown as AppConfig;

  beforeAll(async () => {
    const senhaHash = await gerarHashSenha(SENHA_VALIDA);
    usuarios = [
      {
        id: 'u-rh',
        nome: 'Maria RH',
        email: 'rh@empresa.com.br',
        perfil: PerfilUsuario.RH,
        ativo: true,
        senhaHash,
      },
      {
        id: 'u-off',
        nome: 'Conta Desativada',
        email: 'off@empresa.com.br',
        perfil: PerfilUsuario.RH,
        ativo: false,
        senhaHash,
      },
    ];
  });

  beforeEach(() => {
    update = jest.fn().mockResolvedValue({ id: 'u-rh' });

    const prisma = {
      usuario: {
        findUnique: jest.fn(({ where }: { where: { id?: string; email?: string } }) => {
          const achado = usuarios.find(
            (item) =>
              (where.id !== undefined && item.id === where.id) ||
              (where.email !== undefined && item.email === where.email),
          );
          return Promise.resolve(achado ? { ...achado, obras: [] } : null);
        }),
        update,
      },
    } as unknown as PrismaService;

    sessoes = {
      criar: jest.fn().mockResolvedValue({ sessaoId: 's-1', refreshToken: 'refresh-1' }),
      validar: jest.fn(),
      rotacionar: jest.fn().mockResolvedValue({ sessaoId: 's-2', refreshToken: 'refresh-2' }),
      revogar: jest.fn().mockResolvedValue(undefined),
      revogarTodasDoUsuario: jest.fn().mockResolvedValue(undefined),
      estaAtiva: jest.fn().mockResolvedValue(true),
    };

    coletor = new ColetorAuditoria();
    servico = new AuthService(prisma, sessoes as unknown as SessaoService, jwt, config);
  });

  describe('login (RF-001)', () => {
    it('autentica e devolve access token com perfil e sessao nas claims', async () => {
      const { sessao, refreshToken } = await servico.login(
        { email: 'RH@empresa.com.br', senha: SENHA_VALIDA },
        { ip: '203.0.113.7' },
        coletor,
      );

      const payload = await jwt.verifyAsync<AccessTokenPayload>(sessao.accessToken, {
        secret: SEGREDO_ACESSO,
      });

      expect(payload).toMatchObject({ sub: 'u-rh', perfil: PerfilUsuario.RH, sid: 's-1' });
      expect(sessao.expiraEmSegundos).toBe(900);
      expect(sessao.usuario).toEqual({
        id: 'u-rh',
        nome: 'Maria RH',
        email: 'rh@empresa.com.br',
        perfil: PerfilUsuario.RH,
        obrasIds: [],
      });
      expect(refreshToken).toBe('refresh-1');
    });

    it('nao devolve hash de senha em nenhum campo da resposta', async () => {
      const { sessao } = await servico.login(
        { email: 'rh@empresa.com.br', senha: SENHA_VALIDA },
        {},
        coletor,
      );

      expect(JSON.stringify(sessao)).not.toContain('argon2');
    });

    it('anota a auditoria do login para o interceptor gravar (RF-005)', async () => {
      await servico.login({ email: 'rh@empresa.com.br', senha: SENHA_VALIDA }, {}, coletor);

      expect(coletor.lerDetalhes()).toMatchObject({ usuarioId: 'u-rh', entidadeId: 'u-rh' });
    });

    it('recusa senha errada com a mesma mensagem de e-mail inexistente', async () => {
      const comSenhaErrada = servico
        .login({ email: 'rh@empresa.com.br', senha: 'senha-errada-123' }, {}, coletor)
        .catch((erro: unknown) => erro);

      const semUsuario = servico
        .login({ email: 'ninguem@empresa.com.br', senha: SENHA_VALIDA }, {}, coletor)
        .catch((erro: unknown) => erro);

      const [a, b] = await Promise.all([comSenhaErrada, semUsuario]);

      expect(a).toBeInstanceOf(UnauthorizedException);
      expect(b).toBeInstanceOf(UnauthorizedException);
      expect((a as UnauthorizedException).message).toBe((b as UnauthorizedException).message);
    });

    it('recusa usuario desativado e nao abre sessao', async () => {
      await expect(
        servico.login({ email: 'off@empresa.com.br', senha: SENHA_VALIDA }, {}, coletor),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(sessoes.criar).not.toHaveBeenCalled();
    });
  });

  describe('refresh (RF-001)', () => {
    it('renova a sessao rotacionando o refresh token', async () => {
      sessoes.validar.mockResolvedValue({
        sessaoId: 's-1',
        usuarioId: 'u-rh',
        perfil: PerfilUsuario.RH,
      });

      const { sessao, refreshToken } = await servico.refresh('refresh-1', {});

      expect(sessoes.rotacionar).toHaveBeenCalledWith('s-1', 'u-rh', {});
      expect(refreshToken).toBe('refresh-2');

      const payload = await jwt.verifyAsync<AccessTokenPayload>(sessao.accessToken, {
        secret: SEGREDO_ACESSO,
      });
      expect(payload.sid).toBe('s-2');
    });

    it('recusa quando nao ha cookie de refresh', async () => {
      await expect(servico.refresh(null, {})).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessoes.validar).not.toHaveBeenCalled();
    });

    it('converte refresh invalido em 401 sem revelar o motivo tecnico', async () => {
      sessoes.validar.mockRejectedValue(new RefreshInvalidoError('reuso'));

      await expect(servico.refresh('roubado', {})).rejects.toMatchObject({
        status: 401,
        message: 'Sessao expirada. Faca login novamente.',
      });
    });
  });

  describe('trocarSenha (RF-004)', () => {
    it('troca a senha e encerra todas as sessoes abertas', async () => {
      await servico.trocarSenha(
        'u-rh',
        { senhaAtual: SENHA_VALIDA, novaSenha: 'outra-senha-forte-1' },
        coletor,
      );

      expect(update).toHaveBeenCalledTimes(1);
      const chamadas = update.mock.calls as unknown as { data: { senhaHash: string } }[][];
      expect(chamadas[0]?.[0]?.data.senhaHash).toMatch(/^\$argon2id\$/);
      expect(sessoes.revogarTodasDoUsuario).toHaveBeenCalledWith('u-rh', MotivoRevogacao.SENHA);
    });

    it('recusa quando a senha atual nao confere e nao altera nada', async () => {
      await expect(
        servico.trocarSenha(
          'u-rh',
          { senhaAtual: 'errada-errada-1', novaSenha: 'outra-senha-forte-1' },
          coletor,
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(update).not.toHaveBeenCalled();
      expect(sessoes.revogarTodasDoUsuario).not.toHaveBeenCalled();
    });

    it('recusa repetir a senha atual', async () => {
      await expect(
        servico.trocarSenha('u-rh', { senhaAtual: SENHA_VALIDA, novaSenha: SENHA_VALIDA }, coletor),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revoga a sessao atual no servidor', async () => {
      await servico.logout('s-1');
      expect(sessoes.revogar).toHaveBeenCalledWith('s-1', MotivoRevogacao.LOGOUT);
    });
  });

  describe('usuarioAutenticado', () => {
    it('recusa usuario desativado mesmo com access token ainda valido', async () => {
      await expect(servico.usuarioAutenticado('u-off')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
