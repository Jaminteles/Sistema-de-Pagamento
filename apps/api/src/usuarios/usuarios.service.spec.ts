import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PerfilUsuario } from '@sistema/shared';
import { MotivoRevogacao, type SessaoService } from '../auth/sessao.service';
import { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import type { UsuarioRegistro, UsuariosRepository } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';

const AGORA = new Date('2026-10-07T12:00:00.000Z');

function registro(parcial: Partial<UsuarioRegistro> & { id: string }): UsuarioRegistro {
  return {
    nome: 'Usuario',
    email: 'usuario@empresa.com.br',
    perfil: PerfilUsuario.RH,
    ativo: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
    ...parcial,
  };
}

describe('UsuariosService', () => {
  let banco: Map<string, UsuarioRegistro>;
  let repositorio: {
    listar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorEmail: jest.Mock;
    criar: jest.Mock;
    atualizar: jest.Mock;
    definirSenha: jest.Mock;
    contarAdminsAtivos: jest.Mock;
  };
  let sessoes: { revogarTodasDoUsuario: jest.Mock };
  let servico: UsuariosService;
  let coletor: ColetorAuditoria;

  beforeEach(() => {
    banco = new Map<string, UsuarioRegistro>([
      [
        'u-admin',
        registro({
          id: 'u-admin',
          nome: 'Admin Unico',
          email: 'admin@empresa.com.br',
          perfil: PerfilUsuario.ADMIN,
        }),
      ],
      ['u-rh', registro({ id: 'u-rh', nome: 'Maria RH', email: 'rh@empresa.com.br' })],
    ]);

    repositorio = {
      listar: jest.fn().mockResolvedValue({ itens: [...banco.values()], total: banco.size }),
      buscarPorId: jest.fn((id: string) => Promise.resolve(banco.get(id) ?? null)),
      buscarPorEmail: jest.fn((email: string) => {
        const achado = [...banco.values()].find((item) => item.email === email);
        return Promise.resolve(achado ? { id: achado.id } : null);
      }),
      criar: jest.fn((dados: { nome: string; email: string; perfil: PerfilUsuario }) =>
        Promise.resolve(registro({ id: 'u-novo', ...dados })),
      ),
      atualizar: jest.fn((id: string, dados: Partial<UsuarioRegistro>) => {
        const atual = banco.get(id);
        if (!atual) {
          return Promise.reject(new Error('inexistente'));
        }
        const atualizado = { ...atual, ...dados };
        banco.set(id, atualizado);
        return Promise.resolve(atualizado);
      }),
      definirSenha: jest.fn().mockResolvedValue(undefined),
      // Um unico ADMIN no banco: ignorando ele, sobram zero.
      contarAdminsAtivos: jest.fn((ignorarId?: string) =>
        Promise.resolve(
          [...banco.values()].filter(
            (item) => item.perfil === PerfilUsuario.ADMIN && item.ativo && item.id !== ignorarId,
          ).length,
        ),
      ),
    };

    sessoes = { revogarTodasDoUsuario: jest.fn().mockResolvedValue(undefined) };
    coletor = new ColetorAuditoria();
    servico = new UsuariosService(
      repositorio as unknown as UsuariosRepository,
      sessoes as unknown as SessaoService,
    );
  });

  describe('listagem', () => {
    it('devolve envelope paginado e nunca expoe hash de senha', async () => {
      const resposta = await servico.listar({ pagina: 2, tamanho: 10 });

      expect(resposta).toMatchObject({ pagina: 2, tamanho: 10, total: 2 });
      expect(repositorio.listar).toHaveBeenCalledWith(
        expect.objectContaining({ pular: 10, limite: 10 }),
      );
      expect(JSON.stringify(resposta)).not.toContain('senhaHash');
    });

    it('usa pagina 1 e tamanho padrao quando a query vem vazia', async () => {
      const resposta = await servico.listar({});
      expect(resposta.pagina).toBe(1);
      expect(resposta.tamanho).toBe(20);
    });
  });

  describe('criacao (RF-002)', () => {
    it('cria normalizando o e-mail e audita os dados novos', async () => {
      const criado = await servico.criar(
        {
          nome: '  Joao Financeiro ',
          email: 'FIN@Empresa.com.BR',
          senha: 'senha-de-teste-123',
          perfil: PerfilUsuario.FINANCEIRO,
        },
        coletor,
      );

      expect(criado.email).toBe('fin@empresa.com.br');
      expect(criado.nome).toBe('Joao Financeiro');
      expect(coletor.lerDetalhes()).toMatchObject({
        entidadeId: 'u-novo',
        depois: { perfil: PerfilUsuario.FINANCEIRO },
      });
    });

    it('recusa e-mail ja cadastrado', async () => {
      await expect(
        servico.criar(
          {
            nome: 'Outra Maria',
            email: 'rh@empresa.com.br',
            senha: 'senha-de-teste-123',
            perfil: PerfilUsuario.RH,
          },
          coletor,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repositorio.criar).not.toHaveBeenCalled();
    });

    it('guarda a senha como hash argon2, nunca em claro', async () => {
      await servico.criar(
        {
          nome: 'Joao',
          email: 'joao@empresa.com.br',
          senha: 'senha-de-teste-123',
          perfil: PerfilUsuario.RH,
        },
        coletor,
      );

      const chamadas = repositorio.criar.mock.calls as unknown as { senhaHash: string }[][];
      const senhaHash = chamadas[0]?.[0]?.senhaHash ?? '';
      expect(senhaHash).toMatch(/^\$argon2id\$/);
      expect(senhaHash).not.toContain('senha-de-teste-123');
    });
  });

  describe('atualizacao (RF-002)', () => {
    it('altera o perfil e encerra as sessoes abertas do usuario', async () => {
      const atualizado = await servico.atualizar(
        'u-rh',
        { perfil: PerfilUsuario.FINANCEIRO },
        'u-admin',
        coletor,
      );

      expect(atualizado.perfil).toBe(PerfilUsuario.FINANCEIRO);
      expect(sessoes.revogarTodasDoUsuario).toHaveBeenCalledWith('u-rh', MotivoRevogacao.LOGOUT);
      expect(coletor.lerDetalhes()).toMatchObject({
        antes: { perfil: PerfilUsuario.RH },
        depois: { perfil: PerfilUsuario.FINANCEIRO },
      });
    });

    it('desativar a conta encerra as sessoes abertas', async () => {
      await servico.atualizar('u-rh', { ativo: false }, 'u-admin', coletor);

      expect(sessoes.revogarTodasDoUsuario).toHaveBeenCalledWith(
        'u-rh',
        MotivoRevogacao.USUARIO_INATIVO,
      );
    });

    it('nao audita quando so o nome mudou', async () => {
      await servico.atualizar('u-rh', { nome: 'Maria dos Santos' }, 'u-admin', coletor);

      expect(coletor.lerDetalhes()).toEqual({ ignorar: true });
      expect(sessoes.revogarTodasDoUsuario).not.toHaveBeenCalled();
    });

    it('impede o usuario de alterar o proprio perfil', async () => {
      await expect(
        servico.atualizar('u-admin', { perfil: PerfilUsuario.RH }, 'u-admin', coletor),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repositorio.atualizar).not.toHaveBeenCalled();
    });

    it('impede o usuario de desativar a propria conta', async () => {
      await expect(
        servico.atualizar('u-admin', { ativo: false }, 'u-admin', coletor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('impede rebaixar o ultimo ADMIN ativo', async () => {
      await expect(
        servico.atualizar('u-admin', { perfil: PerfilUsuario.RH }, 'u-rh', coletor),
      ).rejects.toThrow('pelo menos um administrador ativo');
    });

    it('impede desativar o ultimo ADMIN ativo', async () => {
      await expect(
        servico.atualizar('u-admin', { ativo: false }, 'u-rh', coletor),
      ).rejects.toThrow('pelo menos um administrador ativo');
    });

    it('permite rebaixar um ADMIN quando existe outro ativo', async () => {
      banco.set(
        'u-admin2',
        registro({
          id: 'u-admin2',
          nome: 'Segundo Admin',
          email: 'admin2@empresa.com.br',
          perfil: PerfilUsuario.ADMIN,
        }),
      );

      await expect(
        servico.atualizar('u-admin', { perfil: PerfilUsuario.RH }, 'u-rh', coletor),
      ).resolves.toMatchObject({ perfil: PerfilUsuario.RH });
    });

    it('recusa corpo vazio', async () => {
      await expect(servico.atualizar('u-rh', {}, 'u-admin', coletor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('devolve 404 para usuario inexistente', async () => {
      await expect(
        servico.atualizar('u-nao-existe', { nome: 'Qualquer' }, 'u-admin', coletor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('redefinicao de senha pelo admin (RF-004)', () => {
    it('grava hash novo e encerra as sessoes do usuario', async () => {
      await servico.redefinirSenha('u-rh', { novaSenha: 'senha-nova-forte-1' }, coletor);

      const [id, hash] = repositorio.definirSenha.mock.calls[0] as [string, string];
      expect(id).toBe('u-rh');
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(sessoes.revogarTodasDoUsuario).toHaveBeenCalledWith('u-rh', MotivoRevogacao.SENHA);
      expect(coletor.lerDetalhes()).toMatchObject({
        entidadeId: 'u-rh',
        depois: { redefinidaPor: 'ADMINISTRADOR' },
      });
    });

    it('nao vaza a senha nova para a auditoria', async () => {
      await servico.redefinirSenha('u-rh', { novaSenha: 'senha-nova-forte-1' }, coletor);

      expect(JSON.stringify(coletor.lerDetalhes())).not.toContain('senha-nova-forte-1');
    });

    it('devolve 404 para usuario inexistente', async () => {
      await expect(
        servico.redefinirSenha('u-nao-existe', { novaSenha: 'senha-nova-forte-1' }, coletor),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repositorio.definirSenha).not.toHaveBeenCalled();
    });
  });
});
