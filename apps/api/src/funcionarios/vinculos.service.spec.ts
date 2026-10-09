import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PerfilUsuario } from '@sistema/shared';
import { FuncionariosRepositorioEmMemoria } from '../../test/funcionarios-em-memoria';
import type { UsuarioRequisicao } from '../auth/tipos';
import type { JornadasRepository } from '../jornadas/jornadas.repository';
import { EscopoObraService } from '../obras/escopo-obra.service';
import type { ObrasRepository } from '../obras/obras.repository';
import { EscopoFuncionarioService } from './escopo-funcionario.service';
import type { FuncionariosRepository } from './funcionarios.repository';
import { VinculosService } from './vinculos.service';

const CPF_ANA = '52998224725';
const CPF_BRUNO = '11144477735';

const OBRA_CENTRO = 'o-centro';
const OBRA_LITORAL = 'o-litoral';
const OBRA_INATIVA = 'o-antiga';
const JORNADA = 'j-comercial';
const JORNADA_INATIVA = 'j-antiga';

function usuario(perfil: PerfilUsuario, id = 'u-1'): UsuarioRequisicao {
  return { id, perfil, sessaoId: 's-1' };
}

describe('VinculosService (T-026)', () => {
  let repositorio: FuncionariosRepositorioEmMemoria;
  let servico: VinculosService;

  beforeEach(() => {
    repositorio = new FuncionariosRepositorioEmMemoria();

    // Admitida em 05/01/2026; sem vinculo aberto ainda.
    repositorio.semear({ id: 'f-ana', nome: 'Ana Lima', cpf: CPF_ANA, matricula: '001' });
    repositorio.semear({ id: 'f-bruno', nome: 'Bruno Melo', cpf: CPF_BRUNO, matricula: '002' });
    repositorio.semearVinculo({ id: 'v-bruno', funcionarioId: 'f-bruno', obraId: OBRA_LITORAL });

    const obras = {
      obrasDoUsuario: jest.fn((usuarioId: string) =>
        Promise.resolve(usuarioId === 'u-encarregado' ? [OBRA_CENTRO] : []),
      ),
      buscarPorId: jest.fn((id: string) => {
        if (id === OBRA_CENTRO) {
          return Promise.resolve({ id, nome: 'Obra Centro', ativa: true });
        }
        if (id === OBRA_INATIVA) {
          return Promise.resolve({ id, nome: 'Obra Antiga', ativa: false });
        }
        return Promise.resolve(null);
      }),
    } as unknown as ObrasRepository;

    const jornadas = {
      buscarPorId: jest.fn((id: string) => {
        if (id === JORNADA) {
          return Promise.resolve({ id, nome: 'Comercial', ativa: true });
        }
        if (id === JORNADA_INATIVA) {
          return Promise.resolve({ id, nome: 'Antiga', ativa: false });
        }
        return Promise.resolve(null);
      }),
    } as unknown as JornadasRepository;

    const repositorioTipado = repositorio as unknown as FuncionariosRepository;
    const escopo = new EscopoFuncionarioService(new EscopoObraService(obras), repositorioTipado);

    servico = new VinculosService(repositorioTipado, escopo, obras, jornadas);
  });

  const vinculoBase = {
    obraId: OBRA_CENTRO,
    jornadaId: JORNADA,
    inicioVigencia: '2026-02-01',
  };

  it('cria o vinculo com obra e jornada ativas', async () => {
    const criado = await servico.criar('f-ana', vinculoBase, usuario(PerfilUsuario.RH));

    expect(criado.obraId).toBe(OBRA_CENTRO);
    expect(criado.inicioVigencia).toBe('2026-02-01');
    expect(criado.fimVigencia).toBeNull();
  });

  it('recusa inicio anterior a admissao', async () => {
    await expect(
      servico.criar(
        'f-ana',
        { ...vinculoBase, inicioVigencia: '2025-12-01' },
        usuario(PerfilUsuario.RH),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa fim anterior ao inicio', async () => {
    await expect(
      servico.criar(
        'f-ana',
        { ...vinculoBase, fimVigencia: '2026-01-15' },
        usuario(PerfilUsuario.RH),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa obra inexistente', async () => {
    await expect(
      servico.criar('f-ana', { ...vinculoBase, obraId: 'o-fantasma' }, usuario(PerfilUsuario.RH)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa obra inativa', async () => {
    await expect(
      servico.criar('f-ana', { ...vinculoBase, obraId: OBRA_INATIVA }, usuario(PerfilUsuario.RH)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa jornada inativa', async () => {
    await expect(
      servico.criar(
        'f-ana',
        { ...vinculoBase, jornadaId: JORNADA_INATIVA },
        usuario(PerfilUsuario.RH),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('vigencias sem sobreposicao (RF-010)', () => {
    it('recusa segundo vinculo aberto', async () => {
      await servico.criar('f-ana', vinculoBase, usuario(PerfilUsuario.RH));

      await expect(
        servico.criar(
          'f-ana',
          { ...vinculoBase, inicioVigencia: '2026-06-01' },
          usuario(PerfilUsuario.RH),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa vigencia que invade um vinculo encerrado', async () => {
      await servico.criar(
        'f-ana',
        { ...vinculoBase, fimVigencia: '2026-05-31' },
        usuario(PerfilUsuario.RH),
      );

      await expect(
        servico.criar(
          'f-ana',
          { ...vinculoBase, inicioVigencia: '2026-05-31' },
          usuario(PerfilUsuario.RH),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('aceita o vinculo seguinte quando o anterior esta encerrado', async () => {
      await servico.criar(
        'f-ana',
        { ...vinculoBase, fimVigencia: '2026-05-31' },
        usuario(PerfilUsuario.RH),
      );

      const segundo = await servico.criar(
        'f-ana',
        { ...vinculoBase, inicioVigencia: '2026-06-01' },
        usuario(PerfilUsuario.RH),
      );

      expect(segundo.inicioVigencia).toBe('2026-06-01');
      expect(await servico.listar('f-ana', usuario(PerfilUsuario.RH))).toHaveLength(2);
    });

    it('encerra o vinculo pela alteracao, sem conflitar consigo mesmo', async () => {
      const criado = await servico.criar('f-ana', vinculoBase, usuario(PerfilUsuario.RH));

      const encerrado = await servico.atualizar(
        'f-ana',
        criado.id,
        { fimVigencia: '2026-05-31' },
        usuario(PerfilUsuario.RH),
      );

      expect(encerrado.fimVigencia).toBe('2026-05-31');
    });
  });

  describe('escopo do encarregado (RN-05)', () => {
    it('nao lista vinculos de funcionario de outra obra', async () => {
      await expect(
        servico.listar('f-bruno', usuario(PerfilUsuario.ENCARREGADO, 'u-encarregado')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('nao altera vinculo de outro funcionario pelo id da rota', async () => {
    await expect(
      servico.atualizar(
        'f-ana',
        'v-bruno',
        { fimVigencia: '2026-05-31' },
        usuario(PerfilUsuario.RH),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exige pelo menos um campo na alteracao', async () => {
    const criado = await servico.criar('f-ana', vinculoBase, usuario(PerfilUsuario.RH));

    await expect(
      servico.atualizar('f-ana', criado.id, {}, usuario(PerfilUsuario.RH)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
