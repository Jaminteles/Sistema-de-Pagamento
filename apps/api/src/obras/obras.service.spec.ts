import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PerfilUsuario } from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import { EscopoObraService } from './escopo-obra.service';
import type { ObraRegistro, ObrasRepository } from './obras.repository';
import { ObrasService } from './obras.service';

const AGORA = new Date('2026-11-09T12:00:00.000Z');

function registro(parcial: Partial<ObraRegistro> & { id: string }): ObraRegistro {
  return {
    nome: 'Obra',
    endereco: null,
    ativa: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
    ...parcial,
  };
}

function usuario(perfil: PerfilUsuario, id = 'u-1'): UsuarioRequisicao {
  return { id, perfil, sessaoId: 's-1' };
}

describe('ObrasService (T-016, T-017)', () => {
  let banco: Map<string, ObraRegistro>;
  /** usuarioId -> obras vinculadas. */
  let vinculos: Map<string, string[]>;
  let repositorio: {
    listar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorNome: jest.Mock;
    criar: jest.Mock;
    atualizar: jest.Mock;
    obrasDoUsuario: jest.Mock;
    encarregadosDaObra: jest.Mock;
    encarregadosExistentes: jest.Mock;
    definirEncarregados: jest.Mock;
  };
  let servico: ObrasService;
  let coletor: ColetorAuditoria;

  beforeEach(() => {
    banco = new Map<string, ObraRegistro>([
      ['o-centro', registro({ id: 'o-centro', nome: 'Obra Centro' })],
      ['o-litoral', registro({ id: 'o-litoral', nome: 'Obra Litoral' })],
      ['o-antiga', registro({ id: 'o-antiga', nome: 'Obra Antiga', ativa: false })],
    ]);

    vinculos = new Map<string, string[]>([['u-encarregado', ['o-centro']]]);

    repositorio = {
      listar: jest.fn(
        (filtro: { obrasPermitidas?: readonly string[]; ativa?: boolean; busca?: string }) => {
          let itens = [...banco.values()];
          if (filtro.obrasPermitidas) {
            itens = itens.filter((item) => filtro.obrasPermitidas?.includes(item.id));
          }
          if (filtro.ativa !== undefined) {
            itens = itens.filter((item) => item.ativa === filtro.ativa);
          }
          if (filtro.busca) {
            const termo = filtro.busca.toLowerCase();
            itens = itens.filter((item) => item.nome.toLowerCase().includes(termo));
          }
          return Promise.resolve({ itens, total: itens.length });
        },
      ),
      buscarPorId: jest.fn((id: string) => Promise.resolve(banco.get(id) ?? null)),
      buscarPorNome: jest.fn((nome: string) => {
        const achada = [...banco.values()].find(
          (item) => item.nome.toLowerCase() === nome.toLowerCase(),
        );
        return Promise.resolve(achada ? { id: achada.id } : null);
      }),
      criar: jest.fn((dados: { nome: string; endereco: string | null }) => {
        const criada = registro({ id: 'o-nova', ...dados });
        banco.set(criada.id, criada);
        return Promise.resolve(criada);
      }),
      atualizar: jest.fn((id: string, dados: Partial<ObraRegistro>) => {
        const atual = banco.get(id);
        if (!atual) {
          return Promise.reject(new Error('inexistente'));
        }
        const atualizada = { ...atual, ...dados };
        banco.set(id, atualizada);
        return Promise.resolve(atualizada);
      }),
      obrasDoUsuario: jest.fn((usuarioId: string) =>
        Promise.resolve(vinculos.get(usuarioId) ?? []),
      ),
      encarregadosDaObra: jest.fn((obraId: string) =>
        Promise.resolve(
          [...vinculos.entries()]
            .filter(([, obras]) => obras.includes(obraId))
            .map(([usuarioId]) => ({
              usuarioId,
              nome: 'Encarregado',
              email: 'enc@empresa.com.br',
              ativo: true,
            })),
        ),
      ),
      // So 'u-encarregado' e 'u-encarregado-2' tem perfil ENCARREGADO.
      encarregadosExistentes: jest.fn((ids: readonly string[]) =>
        Promise.resolve(ids.filter((id) => id.startsWith('u-encarregado'))),
      ),
      definirEncarregados: jest.fn((obraId: string, usuariosIds: readonly string[]) => {
        for (const [usuarioId, obras] of vinculos) {
          vinculos.set(
            usuarioId,
            obras.filter((obra) => obra !== obraId),
          );
        }
        for (const usuarioId of usuariosIds) {
          vinculos.set(usuarioId, [...(vinculos.get(usuarioId) ?? []), obraId]);
        }
        return Promise.resolve();
      }),
    };

    const comoRepositorio = repositorio as unknown as ObrasRepository;
    servico = new ObrasService(comoRepositorio, new EscopoObraService(comoRepositorio));
    coletor = new ColetorAuditoria();
  });

  describe('listagem', () => {
    it('devolve todas as obras para o RH', async () => {
      const resposta = await servico.listar({}, usuario(PerfilUsuario.RH));

      expect(resposta.total).toBe(3);
      // Sem recorte por obra: o repositorio e chamado sem `obrasPermitidas`.
      const chamadas = repositorio.listar.mock.calls as [{ obrasPermitidas?: unknown }][];
      expect(chamadas[0]?.[0].obrasPermitidas).toBeUndefined();
    });

    it('filtra automaticamente pelas obras do encarregado (RN-05)', async () => {
      const resposta = await servico.listar(
        {},
        usuario(PerfilUsuario.ENCARREGADO, 'u-encarregado'),
      );

      expect(resposta.itens.map((item) => item.id)).toEqual(['o-centro']);
      expect(repositorio.listar).toHaveBeenCalledWith(
        expect.objectContaining({ obrasPermitidas: ['o-centro'] }),
      );
    });

    it('nao vaza obra alguma para encarregado sem vinculo', async () => {
      const resposta = await servico.listar({}, usuario(PerfilUsuario.ENCARREGADO, 'u-sem-obra'));

      expect(resposta).toEqual({ itens: [], total: 0, pagina: 1, tamanho: 20 });
      expect(repositorio.listar).not.toHaveBeenCalled();
    });

    it('aplica os filtros de situacao e busca', async () => {
      const resposta = await servico.listar(
        { ativa: false, busca: ' antiga ' },
        usuario(PerfilUsuario.ADMIN),
      );

      expect(resposta.itens.map((item) => item.id)).toEqual(['o-antiga']);
      expect(repositorio.listar).toHaveBeenCalledWith(
        expect.objectContaining({ busca: 'antiga', ativa: false }),
      );
    });
  });

  describe('consulta por id', () => {
    it('recusa com 404 a obra fora do escopo do encarregado (IDOR)', async () => {
      await expect(
        servico.buscar('o-litoral', usuario(PerfilUsuario.ENCARREGADO, 'u-encarregado')),
      ).rejects.toBeInstanceOf(NotFoundException);

      // Nem chega a consultar a obra: o escopo barra antes.
      expect(repositorio.buscarPorId).not.toHaveBeenCalled();
    });

    it('devolve a obra vinculada ao encarregado', async () => {
      const obra = await servico.buscar(
        'o-centro',
        usuario(PerfilUsuario.ENCARREGADO, 'u-encarregado'),
      );

      expect(obra.nome).toBe('Obra Centro');
    });

    it('responde 404 quando a obra nao existe', async () => {
      await expect(
        servico.buscar('o-fantasma', usuario(PerfilUsuario.ADMIN)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('criacao', () => {
    it('cria a obra normalizando nome e endereco vazio', async () => {
      const criada = await servico.criar({ nome: '  Obra Nova  ', endereco: '   ' });

      expect(criada.nome).toBe('Obra Nova');
      expect(criada.endereco).toBeNull();
    });

    it('recusa nome repetido, ignorando maiusculas', async () => {
      await expect(servico.criar({ nome: 'obra centro' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('atualizacao', () => {
    it('desativa a obra em vez de excluir', async () => {
      const atualizada = await servico.atualizar('o-centro', { ativa: false });

      expect(atualizada.ativa).toBe(false);
      expect(banco.get('o-centro')?.ativa).toBe(false);
    });

    it('exige pelo menos um campo', async () => {
      await expect(servico.atualizar('o-centro', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa renomear para o nome de outra obra', async () => {
      await expect(servico.atualizar('o-centro', { nome: 'Obra Litoral' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('aceita manter o proprio nome com outra grafia', async () => {
      const atualizada = await servico.atualizar('o-centro', { nome: 'OBRA CENTRO' });

      expect(atualizada.nome).toBe('OBRA CENTRO');
    });

    it('responde 404 para obra inexistente', async () => {
      await expect(servico.atualizar('o-fantasma', { ativa: true })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('vinculo de encarregados (RF-003)', () => {
    it('substitui a lista e audita os ids', async () => {
      const resultado = await servico.definirEncarregados(
        'o-litoral',
        { usuariosIds: ['u-encarregado', 'u-encarregado-2'] },
        coletor,
      );

      expect(resultado).toHaveLength(2);
      expect(vinculos.get('u-encarregado-2')).toContain('o-litoral');

      const detalhes = coletor.lerDetalhes();
      expect(detalhes.entidadeId).toBe('o-litoral');
      expect(detalhes.antes).toEqual({ encarregadosIds: [] });
      expect(detalhes.depois).toEqual({
        encarregadosIds: ['u-encarregado', 'u-encarregado-2'],
      });
    });

    it('aceita lista vazia para desvincular todos', async () => {
      const resultado = await servico.definirEncarregados('o-centro', { usuariosIds: [] }, coletor);

      expect(resultado).toEqual([]);
      expect(vinculos.get('u-encarregado')).toEqual([]);
    });

    it('recusa usuario que nao tem perfil Encarregado', async () => {
      await expect(
        servico.definirEncarregados('o-centro', { usuariosIds: ['u-rh'] }, coletor),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repositorio.definirEncarregados).not.toHaveBeenCalled();
    });

    it('ignora ids repetidos no corpo', async () => {
      await servico.definirEncarregados(
        'o-litoral',
        { usuariosIds: ['u-encarregado', 'u-encarregado'] },
        coletor,
      );

      expect(repositorio.definirEncarregados).toHaveBeenCalledWith('o-litoral', ['u-encarregado']);
    });

    it('responde 404 para obra inexistente', async () => {
      await expect(
        servico.definirEncarregados('o-fantasma', { usuariosIds: [] }, coletor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
