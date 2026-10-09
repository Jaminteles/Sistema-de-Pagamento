import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PerfilUsuario, SituacaoFuncionario } from '@sistema/shared';
import { FuncionariosRepositorioEmMemoria } from '../../test/funcionarios-em-memoria';
import type { UsuarioRequisicao } from '../auth/tipos';
import { EscopoObraService } from '../obras/escopo-obra.service';
import type { ObrasRepository } from '../obras/obras.repository';
import { EscopoFuncionarioService } from './escopo-funcionario.service';
import type { FuncionariosRepository } from './funcionarios.repository';
import { FuncionariosService } from './funcionarios.service';

const CPF_ANA = '52998224725';
const CPF_BRUNO = '11144477735';
const CPF_NOVO = '12345678909';

const OBRA_CENTRO = 'o-centro';
const OBRA_LITORAL = 'o-litoral';

function usuario(perfil: PerfilUsuario, id = 'u-1'): UsuarioRequisicao {
  return { id, perfil, sessaoId: 's-1' };
}

describe('FuncionariosService (T-024)', () => {
  let repositorio: FuncionariosRepositorioEmMemoria;
  let servico: FuncionariosService;

  beforeEach(() => {
    repositorio = new FuncionariosRepositorioEmMemoria();

    repositorio.semear({ id: 'f-ana', nome: 'Ana Lima', cpf: CPF_ANA, matricula: '001' });
    repositorio.semear({ id: 'f-bruno', nome: 'Bruno Melo', cpf: CPF_BRUNO, matricula: '002' });
    repositorio.semearVinculo({ id: 'v-ana', funcionarioId: 'f-ana', obraId: OBRA_CENTRO });
    repositorio.semearVinculo({ id: 'v-bruno', funcionarioId: 'f-bruno', obraId: OBRA_LITORAL });

    // Encarregado vinculado somente a Obra Centro (RN-05).
    const obras = {
      obrasDoUsuario: jest.fn((usuarioId: string) => {
        if (usuarioId === 'u-encarregado') {
          return Promise.resolve([OBRA_CENTRO]);
        }
        if (usuarioId === 'u-dois-obras') {
          return Promise.resolve([OBRA_CENTRO, OBRA_LITORAL]);
        }
        return Promise.resolve([]);
      }),
    } as unknown as ObrasRepository;

    const repositorioTipado = repositorio as unknown as FuncionariosRepository;
    const escopo = new EscopoFuncionarioService(
      new EscopoObraService(obras),
      repositorioTipado,
    );

    servico = new FuncionariosService(repositorioTipado, escopo);
  });

  describe('escopo do encarregado (RN-05)', () => {
    it('lista somente os funcionarios das obras vinculadas ao encarregado', async () => {
      const resposta = await servico.listar({}, usuario(PerfilUsuario.ENCARREGADO, 'u-encarregado'));

      expect(resposta.itens.map((item) => item.id)).toEqual(['f-ana']);
      expect(resposta.total).toBe(1);
    });

    it('nao devolve funcionario de outra obra pelo id da rota (IDOR)', async () => {
      await expect(
        servico.buscar('f-bruno', usuario(PerfilUsuario.ENCARREGADO, 'u-encarregado')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('nao amplia o escopo quando o encarregado pede uma obra que nao e dele', async () => {
      const resposta = await servico.listar(
        { obraId: OBRA_LITORAL },
        usuario(PerfilUsuario.ENCARREGADO, 'u-encarregado'),
      );

      expect(resposta.itens).toEqual([]);
      expect(resposta.total).toBe(0);
    });

    it('estreita por obra dentro do escopo, sem perder o recorte', async () => {
      // Encarregado de duas obras filtrando por uma delas: ve so a pedida.
      repositorio.semear({ id: 'f-caio', nome: 'Caio Reis', cpf: '12345678909', matricula: '003' });
      repositorio.semearVinculo({ id: 'v-caio', funcionarioId: 'f-caio', obraId: OBRA_LITORAL });

      const resposta = await servico.listar(
        { obraId: OBRA_CENTRO },
        usuario(PerfilUsuario.ENCARREGADO, 'u-dois-obras'),
      );

      expect(resposta.itens.map((item) => item.id)).toEqual(['f-ana']);
    });

    it('encarregado sem obra vinculada nao alcanca ninguem', async () => {
      const resposta = await servico.listar({}, usuario(PerfilUsuario.ENCARREGADO, 'u-sem-obra'));

      expect(resposta.itens).toEqual([]);
    });

    it('RH alcanca todos os funcionarios', async () => {
      const resposta = await servico.listar({}, usuario(PerfilUsuario.RH));

      expect(resposta.itens.map((item) => item.id)).toEqual(['f-ana', 'f-bruno']);
    });
  });

  describe('mascara de CPF (RNF-05)', () => {
    it('devolve o CPF completo para RH', async () => {
      const funcionario = await servico.buscar('f-ana', usuario(PerfilUsuario.RH));

      expect(funcionario.cpf).toBe('529.982.247-25');
      expect(funcionario.cpfMascarado).toBe(false);
    });

    it('mascara o CPF para o encarregado, na resposta da API', async () => {
      const funcionario = await servico.buscar(
        'f-ana',
        usuario(PerfilUsuario.ENCARREGADO, 'u-encarregado'),
      );

      expect(funcionario.cpf).toBe('***.982.247-**');
      expect(funcionario.cpfMascarado).toBe(true);
      expect(funcionario.cpf).not.toContain('529');
    });
  });

  describe('criacao', () => {
    it('guarda somente os digitos do CPF e devolve formatado', async () => {
      const criado = await servico.criar(
        {
          nome: 'Carla Souza',
          cpf: '123.456.789-09',
          matricula: '003',
          admissao: '2026-11-23',
        },
        usuario(PerfilUsuario.RH),
      );

      expect(criado.cpf).toBe('123.456.789-09');
      expect(repositorio.funcionarios.at(-1)?.cpf).toBe(CPF_NOVO);
      expect(criado.situacao).toBe(SituacaoFuncionario.ATIVO);
      expect(criado.temDadosPagamento).toBe(false);
    });

    it('recusa CPF ja cadastrado', async () => {
      await expect(
        servico.criar(
          { nome: 'Ana Clone', cpf: CPF_ANA, matricula: '999', admissao: '2026-11-23' },
          usuario(PerfilUsuario.RH),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa matricula ja cadastrada', async () => {
      await expect(
        servico.criar(
          { nome: 'Outro Nome', cpf: CPF_NOVO, matricula: '001', admissao: '2026-11-23' },
          usuario(PerfilUsuario.RH),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('alteracao e RN-12', () => {
    it('exige pelo menos um campo', async () => {
      await expect(servico.atualizar('f-ana', {}, usuario(PerfilUsuario.RH))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('recusa desligar sem a data de desligamento', async () => {
      await expect(
        servico.atualizar(
          'f-ana',
          { situacao: SituacaoFuncionario.DESLIGADO },
          usuario(PerfilUsuario.RH),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa data de desligamento sem colocar na situacao Desligado', async () => {
      await expect(
        servico.atualizar('f-ana', { desligamento: '2027-01-31' }, usuario(PerfilUsuario.RH)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa desligamento anterior a admissao', async () => {
      await expect(
        servico.atualizar(
          'f-ana',
          { desligamento: '2025-12-31', situacao: SituacaoFuncionario.DESLIGADO },
          usuario(PerfilUsuario.RH),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('desliga quando a situacao e a data vem juntas', async () => {
      const atualizado = await servico.atualizar(
        'f-ana',
        { desligamento: '2027-01-31', situacao: SituacaoFuncionario.DESLIGADO },
        usuario(PerfilUsuario.RH),
      );

      expect(atualizado.situacao).toBe(SituacaoFuncionario.DESLIGADO);
      expect(atualizado.desligamento).toBe('2027-01-31');
    });

    it('recusa matricula de outro funcionario', async () => {
      await expect(
        servico.atualizar('f-ana', { matricula: '002' }, usuario(PerfilUsuario.RH)),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('nao encontra funcionario inexistente', async () => {
      await expect(
        servico.atualizar('f-nao-existe', { nome: 'Teste' }, usuario(PerfilUsuario.RH)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('busca', () => {
    it('encontra por digitos do CPF, mesmo com pontuacao no termo', async () => {
      const resposta = await servico.listar({ busca: '529.982' }, usuario(PerfilUsuario.RH));

      expect(resposta.itens.map((item) => item.id)).toEqual(['f-ana']);
    });

    it('encontra por nome', async () => {
      const resposta = await servico.listar({ busca: 'bruno' }, usuario(PerfilUsuario.RH));

      expect(resposta.itens.map((item) => item.id)).toEqual(['f-bruno']);
    });
  });
});
