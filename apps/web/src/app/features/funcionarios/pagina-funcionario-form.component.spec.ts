import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  type AtualizarFuncionarioRequest,
  type CriarFuncionarioRequest,
  type DadosPagamentoResponse,
  type DefinirDadosPagamentoRequest,
  type FuncionarioResponse,
  type JornadaResponse,
  type ObraResponse,
  type RespostaPaginada,
  SituacaoFuncionario,
  TipoChavePix,
  type VinculoFuncionarioResponse,
} from '@sistema/shared';
import { of } from 'rxjs';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { JornadasService } from '../jornadas/jornadas.service';
import { ObrasService } from '../obras/obras.service';
import { FuncionariosService } from './funcionarios.service';
import { PaginaFuncionarioFormComponent } from './pagina-funcionario-form.component';

const FUNCIONARIO: FuncionarioResponse = {
  id: 'f-1',
  nome: 'Ana Lima',
  cpf: '529.982.247-25',
  cpfMascarado: false,
  matricula: '001',
  cargo: 'Pedreira',
  admissao: '2026-01-05',
  desligamento: null,
  situacao: SituacaoFuncionario.ATIVO,
  vinculoAtual: null,
  temDadosPagamento: false,
  criadoEm: '2026-01-05T12:00:00.000Z',
  atualizadoEm: '2026-01-05T12:00:00.000Z',
};

const VINCULO: VinculoFuncionarioResponse = {
  id: 'v-1',
  funcionarioId: 'f-1',
  obraId: 'o-1',
  obraNome: 'Obra Centro',
  jornadaId: 'j-1',
  jornadaNome: 'Comercial',
  inicioVigencia: '2026-01-05',
  fimVigencia: null,
  criadoEm: '2026-01-05T12:00:00.000Z',
};

function pagamento(parcial: Partial<DadosPagamentoResponse>): DadosPagamentoResponse {
  return {
    funcionarioId: 'f-1',
    tipoChave: null,
    chavePix: null,
    chavePixMascara: null,
    banco: null,
    agencia: null,
    conta: null,
    contaMascara: null,
    mascarado: false,
    validadoEm: null,
    atualizadoEm: null,
    ...parcial,
  };
}

describe('PaginaFuncionarioFormComponent (T-029)', () => {
  let fixture: ComponentFixture<PaginaFuncionarioFormComponent>;
  let componente: PaginaFuncionarioFormComponent;
  let criados: CriarFuncionarioRequest[];
  let alteracoes: AtualizarFuncionarioRequest[];
  let pagamentosSalvos: DefinirDadosPagamentoRequest[];
  let dadosPagamento: DadosPagamentoResponse;

  async function montar(id?: string): Promise<void> {
    criados = [];
    alteracoes = [];
    pagamentosSalvos = [];

    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [PaginaFuncionarioFormComponent],
      providers: [
        {
          provide: FuncionariosService,
          useValue: {
            buscar: () => of(FUNCIONARIO),
            criar: (dados: CriarFuncionarioRequest) => {
              criados.push(dados);
              return of({ ...FUNCIONARIO, ...dados, id: 'f-novo' });
            },
            atualizar: (_id: string, dados: AtualizarFuncionarioRequest) => {
              alteracoes.push(dados);
              return of({ ...FUNCIONARIO, ...dados });
            },
            buscarDadosPagamento: () => of(dadosPagamento),
            definirDadosPagamento: (_id: string, dados: DefinirDadosPagamentoRequest) => {
              pagamentosSalvos.push(dados);
              return of(pagamento({ tipoChave: dados.tipoChave ?? null }));
            },
            listarVinculos: () => of<VinculoFuncionarioResponse[]>([VINCULO]),
            criarVinculo: () => of(VINCULO),
            atualizarVinculo: () => of({ ...VINCULO, fimVigencia: '2026-11-30' }),
          },
        },
        {
          provide: ObrasService,
          useValue: {
            listar: () =>
              of<RespostaPaginada<ObraResponse>>({
                itens: [
                  {
                    id: 'o-1',
                    nome: 'Obra Centro',
                    endereco: null,
                    ativa: true,
                    criadoEm: '2026-11-01T12:00:00.000Z',
                    atualizadoEm: '2026-11-01T12:00:00.000Z',
                  },
                ],
                total: 1,
                pagina: 1,
                tamanho: 100,
              }),
          },
        },
        {
          provide: JornadasService,
          useValue: {
            listar: () =>
              of<RespostaPaginada<JornadaResponse>>({ itens: [], total: 0, pagina: 1, tamanho: 100 }),
          },
        },
        {
          provide: NotificacaoService,
          useValue: { sucesso: () => undefined, erro: () => undefined },
        },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginaFuncionarioFormComponent);
    componente = fixture.componentInstance;
    if (id !== undefined) {
      fixture.componentRef.setInput('id', id);
    }
    await fixture.whenStable();
  }

  beforeEach(() => {
    dadosPagamento = pagamento({});
  });

  describe('criacao', () => {
    it('recusa CPF invalido antes de chamar a API', async () => {
      await montar();

      componente.form.patchValue({
        nome: 'Carla Souza',
        cpf: '111.111.111-11',
        matricula: '003',
        admissao: '2026-11-23',
      });
      componente.salvar();

      expect(componente.form.controls.cpf.errors).toEqual({ cpf: true });
      expect(criados).toEqual([]);
    });

    it('envia o cadastro quando o CPF e valido', async () => {
      await montar();

      componente.form.patchValue({
        nome: 'Carla Souza',
        cpf: '123.456.789-09',
        matricula: '003',
        admissao: '2026-11-23',
      });
      componente.salvar();

      expect(criados).toEqual([
        {
          nome: 'Carla Souza',
          cpf: '123.456.789-09',
          matricula: '003',
          cargo: null,
          admissao: '2026-11-23',
        },
      ]);
    });
  });

  describe('edicao', () => {
    it('bloqueia a alteracao do CPF', async () => {
      await montar('f-1');

      expect(componente.form.controls.cpf.disabled).toBe(true);
    });

    it('envia somente os campos alterados', async () => {
      await montar('f-1');

      componente.form.patchValue({ cargo: 'Mestre de obras' });
      componente.salvar();

      expect(alteracoes).toEqual([{ cargo: 'Mestre de obras' }]);
    });

    it('nao chama a API quando nada mudou', async () => {
      await montar('f-1');

      componente.salvar();

      expect(alteracoes).toEqual([]);
    });
  });

  describe('aba de pagamento (RF-007)', () => {
    it('envia a chave Pix com o tipo', async () => {
      await montar('f-1');

      componente.formPagamento.patchValue({
        tipoChave: TipoChavePix.EMAIL,
        chavePix: 'ana.lima@empresa.com.br',
      });
      componente.salvarPagamento();

      expect(pagamentosSalvos).toEqual([
        {
          tipoChave: TipoChavePix.EMAIL,
          chavePix: 'ana.lima@empresa.com.br',
          banco: null,
          agencia: null,
          conta: null,
        },
      ]);
    });

    it('recusa chave que nao casa com o tipo antes de chamar a API', async () => {
      await montar('f-1');

      componente.formPagamento.patchValue({
        tipoChave: TipoChavePix.CPF,
        chavePix: 'nao-e-cpf',
      });
      componente.salvarPagamento();

      expect(componente.formPagamento.controls.chavePix.errors).toEqual({ chavePix: true });
      expect(pagamentosSalvos).toEqual([]);
    });

    it('recebe somente a mascara quando a API mascara os dados (RNF-05)', async () => {
      dadosPagamento = pagamento({
        mascarado: true,
        tipoChave: TipoChavePix.EMAIL,
        chavePixMascara: 'a*******@empresa.com.br',
      });

      await montar('f-1');

      // Com `mascarado`, o template troca o formulario pelo aviso com a
      // mascara: o front nunca recebe o valor completo para exibir.
      expect(componente.pagamento()?.mascarado).toBe(true);
      expect(componente.pagamento()?.chavePixMascara).toBe('a*******@empresa.com.br');
      expect(componente.pagamento()?.chavePix).toBeNull();
    });
  });

  describe('aba de vinculos (RF-010)', () => {
    it('identifica o vinculo aberto para encerrar', async () => {
      await montar('f-1');

      expect(componente.vinculoAberto()?.id).toBe('v-1');
    });

    it('nao envia vinculo incompleto', async () => {
      await montar('f-1');

      componente.formVinculo.patchValue({ obraId: 'o-1' });
      componente.adicionarVinculo();

      expect(componente.formVinculo.invalid).toBe(true);
    });
  });
});
