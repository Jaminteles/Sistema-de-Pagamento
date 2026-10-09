import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PerfilUsuario, TipoChavePix } from '@sistema/shared';
import { FuncionariosRepositorioEmMemoria } from '../../test/funcionarios-em-memoria';
import type { UsuarioRequisicao } from '../auth/tipos';
import { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import { CriptografiaService } from '../common/crypto/criptografia.service';
import type { AppConfig } from '../config/app.config';
import { EscopoObraService } from '../obras/escopo-obra.service';
import type { ObrasRepository } from '../obras/obras.repository';
import { DadosPagamentoService } from './dados-pagamento.service';
import { EscopoFuncionarioService } from './escopo-funcionario.service';
import type { FuncionariosRepository } from './funcionarios.repository';

const CPF_ANA = '52998224725';
const CPF_BRUNO = '11144477735';
const CHAVE_EMAIL = 'ana.lima@empresa.com.br';

const OBRA_CENTRO = 'o-centro';
const OBRA_LITORAL = 'o-litoral';

function usuario(perfil: PerfilUsuario, id = 'u-1'): UsuarioRequisicao {
  return { id, perfil, sessaoId: 's-1' };
}

describe('DadosPagamentoService (T-025)', () => {
  let repositorio: FuncionariosRepositorioEmMemoria;
  let cripto: CriptografiaService;
  let servico: DadosPagamentoService;
  let coletor: ColetorAuditoria;

  beforeEach(() => {
    repositorio = new FuncionariosRepositorioEmMemoria();
    repositorio.semear({ id: 'f-ana', nome: 'Ana Lima', cpf: CPF_ANA, matricula: '001' });
    repositorio.semear({ id: 'f-bruno', nome: 'Bruno Melo', cpf: CPF_BRUNO, matricula: '002' });
    repositorio.semearVinculo({ id: 'v-ana', funcionarioId: 'f-ana', obraId: OBRA_CENTRO });
    repositorio.semearVinculo({ id: 'v-bruno', funcionarioId: 'f-bruno', obraId: OBRA_LITORAL });

    const obras = {
      obrasDoUsuario: jest.fn((usuarioId: string) =>
        Promise.resolve(usuarioId === 'u-encarregado' ? [OBRA_CENTRO] : []),
      ),
    } as unknown as ObrasRepository;

    const repositorioTipado = repositorio as unknown as FuncionariosRepository;
    const escopo = new EscopoFuncionarioService(new EscopoObraService(obras), repositorioTipado);

    // Chave de teste de 32 bytes: nenhuma relacao com ambiente real.
    cripto = new CriptografiaService({
      dadosPagamentoChave: Buffer.alloc(32, 3).toString('base64'),
    } as unknown as AppConfig);

    servico = new DadosPagamentoService(repositorioTipado, escopo, cripto);
    coletor = new ColetorAuditoria();
  });

  async function definirChaveDaAna(): Promise<void> {
    await servico.definir(
      'f-ana',
      { tipoChave: TipoChavePix.EMAIL, chavePix: CHAVE_EMAIL },
      usuario(PerfilUsuario.RH),
      coletor,
    );
  }

  describe('criptografia em repouso (RNF-04)', () => {
    it('nao grava a chave Pix em claro', async () => {
      await definirChaveDaAna();

      const gravado = repositorio.pagamentos.get('f-ana');
      expect(gravado?.chavePixCriptografada).not.toBeNull();
      expect(gravado?.chavePixCriptografada).not.toContain(CHAVE_EMAIL);
      expect(cripto.descriptografar(gravado?.chavePixCriptografada as string)).toBe(CHAVE_EMAIL);
    });

    it('nao grava a conta em claro', async () => {
      await servico.definir(
        'f-ana',
        { banco: '001', agencia: '1234', conta: '98765-4' },
        usuario(PerfilUsuario.RH),
        coletor,
      );

      const gravado = repositorio.pagamentos.get('f-ana');
      expect(gravado?.contaCriptografada).not.toContain('98765');
      expect(cripto.descriptografar(gravado?.contaCriptografada as string)).toBe('98765-4');
      expect(gravado?.contaMascara).toBe('****5-4');
    });
  });

  describe('mascara por perfil (RNF-05)', () => {
    it('devolve a chave em claro para o financeiro', async () => {
      await definirChaveDaAna();

      const resposta = await servico.buscar('f-ana', usuario(PerfilUsuario.FINANCEIRO));

      expect(resposta.mascarado).toBe(false);
      expect(resposta.chavePix).toBe(CHAVE_EMAIL);
    });

    it('devolve somente a mascara para perfil sem permissao', async () => {
      await definirChaveDaAna();

      const resposta = await servico.buscar(
        'f-ana',
        usuario(PerfilUsuario.ENCARREGADO, 'u-encarregado'),
      );

      expect(resposta.mascarado).toBe(true);
      expect(resposta.chavePix).toBeNull();
      expect(resposta.conta).toBeNull();
      expect(resposta.agencia).toBeNull();
      expect(resposta.chavePixMascara).toBe('a*******@empresa.com.br');
    });

    it('devolve resposta vazia quando nao ha dados cadastrados', async () => {
      const resposta = await servico.buscar('f-ana', usuario(PerfilUsuario.RH));

      expect(resposta.tipoChave).toBeNull();
      expect(resposta.chavePix).toBeNull();
      expect(resposta.atualizadoEm).toBeNull();
    });
  });

  describe('escopo do encarregado (RN-05)', () => {
    it('nao acessa dados de pagamento de funcionario de outra obra', async () => {
      await expect(
        servico.buscar('f-bruno', usuario(PerfilUsuario.ENCARREGADO, 'u-encarregado')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('coerencia (RF-007)', () => {
    it('recusa chave Pix sem o tipo', async () => {
      await expect(
        servico.definir('f-ana', { chavePix: CHAVE_EMAIL }, usuario(PerfilUsuario.RH), coletor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa tipo sem a chave', async () => {
      await expect(
        servico.definir(
          'f-ana',
          { tipoChave: TipoChavePix.EMAIL },
          usuario(PerfilUsuario.RH),
          coletor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa chave que nao casa com o tipo', async () => {
      await expect(
        servico.definir(
          'f-ana',
          { tipoChave: TipoChavePix.CPF, chavePix: '111.111.111-11' },
          usuario(PerfilUsuario.RH),
          coletor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa conta pela metade', async () => {
      await expect(
        servico.definir(
          'f-ana',
          { banco: '001', conta: '98765-4' },
          usuario(PerfilUsuario.RH),
          coletor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('limpa o cadastro quando o corpo vem vazio (RN-08)', async () => {
      await definirChaveDaAna();

      const resposta = await servico.definir('f-ana', {}, usuario(PerfilUsuario.RH), coletor);

      expect(resposta.tipoChave).toBeNull();
      expect(resposta.chavePixMascara).toBeNull();
      expect(repositorio.pagamentos.get('f-ana')?.chavePixCriptografada).toBeNull();
    });

    it('normaliza a chave de CPF para digitos', async () => {
      await servico.definir(
        'f-ana',
        { tipoChave: TipoChavePix.CPF, chavePix: '529.982.247-25' },
        usuario(PerfilUsuario.RH),
        coletor,
      );

      const gravado = repositorio.pagamentos.get('f-ana');
      expect(cripto.descriptografar(gravado?.chavePixCriptografada as string)).toBe(CPF_ANA);
      expect(gravado?.chavePixMascara).toBe('***.982.247-**');
    });
  });

  describe('auditoria (RF-005)', () => {
    it('registra a mudanca sem chave, conta ou CPF', async () => {
      await definirChaveDaAna();

      const detalhes = coletor.lerDetalhes();

      expect(detalhes.entidadeId).toBe('f-ana');
      expect(detalhes.antes).toEqual({
        tipoChave: null,
        chaveDefinida: false,
        contaDefinida: false,
      });
      expect(detalhes.depois).toEqual({
        tipoChave: TipoChavePix.EMAIL,
        chaveDefinida: true,
        contaDefinida: false,
      });
      expect(JSON.stringify(detalhes)).not.toContain(CHAVE_EMAIL);
    });
  });
});
