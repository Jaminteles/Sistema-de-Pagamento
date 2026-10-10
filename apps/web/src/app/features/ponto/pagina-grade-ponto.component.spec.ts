import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  type GradeEquipeResponse,
  type LancarEquipeRequest,
  type LancarPontoResponse,
  type ObraResponse,
  OcorrenciaDia,
  OrigemMarcacao,
  PerfilUsuario,
  type RespostaPaginada,
  StatusEnvioDia,
  StatusPeriodo,
  TipoMarcacao,
} from '@sistema/shared';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { ConfirmacaoService } from '../../shared/components/modal-confirmacao/confirmacao.service';
import { ObrasService } from '../obras/obras.service';
import { PaginaGradePontoComponent } from './pagina-grade-ponto.component';
import { PontoService } from './ponto.service';

const OBRAS: ObraResponse[] = [
  {
    id: 'o-1',
    nome: 'Obra Centro',
    endereco: null,
    ativa: true,
    criadoEm: '2026-12-01T12:00:00.000Z',
    atualizadoEm: '2026-12-01T12:00:00.000Z',
  },
];

const JORNADA = {
  id: 'j-1',
  nome: 'Comercial',
  entradaMinutos: 420,
  saidaMinutos: 1020,
  intervaloMinutos: 60,
  toleranciaMinutos: 10,
  diasSemana: [1, 2, 3, 4, 5],
};

const PERIODO = {
  id: 'p-1',
  competencia: '2026-12',
  dataInicio: '2026-12-01',
  dataFim: '2026-12-31',
  status: StatusPeriodo.ABERTO,
  fechadoEm: null,
  reabertoEm: null,
  criadoEm: '2026-12-01T12:00:00.000Z',
  atualizadoEm: '2026-12-01T12:00:00.000Z',
};

function dia(parcial: Partial<GradeEquipeResponse['linhas'][number]['dia']> = {}) {
  return {
    id: 'd-1',
    periodoId: 'p-1',
    funcionarioId: 'f-ana',
    data: '2026-12-07',
    ocorrencia: OcorrenciaDia.NORMAL,
    statusEnvio: StatusEnvioDia.NAO_ENVIADO,
    marcacoes: [],
    observacao: null,
    minutosTrabalhados: 0,
    minutosExtras50: 0,
    minutosExtras100: 0,
    minutosNoturnos: 0,
    minutosAtraso: 0,
    minutosFalta: 0,
    apuradoEm: null,
    editavel: true,
    atualizadoEm: '2026-12-07T12:00:00.000Z',
    ...parcial,
  } as GradeEquipeResponse['linhas'][number]['dia'];
}

function grade(parcial: Partial<GradeEquipeResponse> = {}): GradeEquipeResponse {
  return {
    data: '2026-12-07',
    obraId: 'o-1',
    obraNome: 'Obra Centro',
    periodo: PERIODO,
    feriado: null,
    diaSemana: 1,
    editavel: true,
    linhas: [
      {
        funcionarioId: 'f-ana',
        funcionarioNome: 'Ana Lima',
        matricula: '001',
        jornada: JORNADA,
        dia: dia(),
      },
      {
        funcionarioId: 'f-bruno',
        funcionarioNome: 'Bruno Melo',
        matricula: '002',
        jornada: JORNADA,
        dia: dia({ id: 'd-2', funcionarioId: 'f-bruno' }),
      },
    ],
    ...parcial,
  };
}

describe('PaginaGradePontoComponent (T-036)', () => {
  let fixture: ComponentFixture<PaginaGradePontoComponent>;
  let componente: PaginaGradePontoComponent;
  let enviados: LancarEquipeRequest[];
  let resposta: LancarPontoResponse;
  let gradeAtual: GradeEquipeResponse;
  let avisos: string[];

  async function montar(perfil: PerfilUsuario = PerfilUsuario.ENCARREGADO): Promise<void> {
    enviados = [];
    avisos = [];
    resposta = { salvos: 0, dias: [], erros: [] };

    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [PaginaGradePontoComponent],
      providers: [
        {
          provide: PontoService,
          useValue: {
            grade: () => of(gradeAtual),
            lancarEquipe: (dados: LancarEquipeRequest) => {
              enviados.push(dados);
              return of(resposta);
            },
            abrirPeriodo: () => of({ periodo: PERIODO, funcionarios: 2, diasCriados: 62 }),
          },
        },
        {
          provide: ObrasService,
          useValue: {
            listar: () =>
              of<RespostaPaginada<ObraResponse>>({
                itens: OBRAS,
                total: 1,
                pagina: 1,
                tamanho: 100,
              }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            temAlgumPerfil: (perfis: readonly PerfilUsuario[]) => perfis.includes(perfil),
          },
        },
        {
          provide: NotificacaoService,
          useValue: {
            sucesso: (mensagem: string) => avisos.push(mensagem),
            erro: (mensagem: string) => avisos.push(mensagem),
          },
        },
        { provide: ConfirmacaoService, useValue: { confirmar: () => Promise.resolve(true) } },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginaGradePontoComponent);
    componente = fixture.componentInstance;
    await fixture.whenStable();
  }

  beforeEach(() => {
    gradeAtual = grade();
  });

  it('seleciona a primeira obra e carrega a grade do dia', async () => {
    await montar();

    expect(componente.filtros.controls.obraId.value).toBe('o-1');
    expect(componente.totalLinhas()).toBe(2);
    expect(componente.carregando()).toBe(false);
    expect(componente.linhas.length).toBe(2);
  });

  it('preenche entrada e saida com a jornada de cada linha (RNF-02)', async () => {
    await montar();

    componente.aplicarJornada();

    expect(componente.grupoDa(0).getRawValue().entrada).toBe('07:00');
    expect(componente.grupoDa(0).getRawValue().saida).toBe('17:00');
    // Nao inventa horario de intervalo: a jornada guarda a duracao, nao a hora.
    expect(componente.grupoDa(0).getRawValue().saidaIntervalo).toBe('');
  });

  it('replica os horarios da primeira linha para as demais (RNF-02)', async () => {
    await montar();

    componente.grupoDa(0).patchValue({
      entrada: '07:00',
      saidaIntervalo: '11:00',
      retornoIntervalo: '12:00',
      saida: '17:00',
    });
    componente.replicarPrimeira();

    expect(componente.grupoDa(1).getRawValue()).toMatchObject({
      entrada: '07:00',
      saidaIntervalo: '11:00',
      retornoIntervalo: '12:00',
      saida: '17:00',
    });
  });

  it('envia somente as linhas alteradas', async () => {
    await montar();

    componente.grupoDa(1).patchValue({ entrada: '08:00' });
    componente.salvar();

    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.obraId).toBe('o-1');
    expect(enviados[0]?.data).toBe('2026-12-07');
    expect(enviados[0]?.itens).toEqual([
      {
        funcionarioId: 'f-bruno',
        ocorrencia: OcorrenciaDia.NORMAL,
        observacao: null,
        entrada: '08:00',
        saidaIntervalo: null,
        retornoIntervalo: null,
        saida: null,
      },
    ]);
  });

  it('nao chama a API quando nada mudou', async () => {
    await montar();

    componente.salvar();

    expect(enviados).toEqual([]);
    expect(avisos[0]).toContain('Nada para salvar');
  });

  it('nao envia horario quando a ocorrencia nao aceita marcacao (RF-015)', async () => {
    await montar();

    componente.grupoDa(0).patchValue({ entrada: '07:00', ocorrencia: OcorrenciaDia.FALTA });
    componente.salvar();

    expect(enviados[0]?.itens[0]).toEqual({
      funcionarioId: 'f-ana',
      ocorrencia: OcorrenciaDia.FALTA,
      observacao: null,
    });
  });

  it('mostra na linha o erro que a API devolveu (T-038)', async () => {
    await montar();
    resposta = {
      salvos: 0,
      dias: [],
      erros: [
        {
          funcionarioId: 'f-ana',
          data: '2026-12-07',
          campo: TipoMarcacao.SAIDA,
          motivo: 'Horario fora de ordem.',
        },
      ],
    };

    componente.grupoDa(0).patchValue({ saida: '06:00' });
    componente.salvar();

    expect(componente.errosDe('f-ana')).toHaveLength(1);
    expect(componente.errosDe('f-bruno')).toEqual([]);
    expect(avisos.at(-1)).toContain('recusado');
  });

  it('desabilita a linha do dia que a API marcou como nao editavel (RN-06)', async () => {
    gradeAtual = grade({
      linhas: [
        {
          funcionarioId: 'f-ana',
          funcionarioNome: 'Ana Lima',
          matricula: '001',
          jornada: JORNADA,
          dia: dia({ editavel: false, statusEnvio: StatusEnvioDia.ENVIADO_RH }),
        },
      ],
    });

    await montar();

    expect(componente.grupoDa(0).disabled).toBe(true);
  });

  it('oferece abrir periodo somente para ADMIN e RH', async () => {
    gradeAtual = grade({ periodo: null, editavel: false });

    await montar(PerfilUsuario.ENCARREGADO);
    expect(componente.semPeriodo()).toBe(true);
    expect(componente.podeAbrirPeriodo()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).innerHTML).not.toContain('Abrir periodo');

    await montar(PerfilUsuario.RH);
    expect(componente.podeAbrirPeriodo()).toBe(true);
  });

  it('mantem as marcacoes que a API devolveu ao montar o formulario', async () => {
    gradeAtual = grade({
      linhas: [
        {
          funcionarioId: 'f-ana',
          funcionarioNome: 'Ana Lima',
          matricula: '001',
          jornada: JORNADA,
          dia: dia({
            marcacoes: [
              {
                id: 'm-1',
                tipo: TipoMarcacao.ENTRADA,
                hora: '07:05',
                horario: '2026-12-07T10:05:00.000Z',
                origem: OrigemMarcacao.MANUAL,
                diaSeguinte: false,
              },
            ],
          }),
        },
      ],
    });

    await montar();

    expect(componente.grupoDa(0).getRawValue().entrada).toBe('07:05');
  });
});
