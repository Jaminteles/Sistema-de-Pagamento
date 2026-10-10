import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import {
  type DiaPontoResponse,
  type LancarFuncionarioRequest,
  type LancarPontoResponse,
  OcorrenciaDia,
  type PontoFuncionarioResponse,
  StatusEnvioDia,
  StatusPeriodo,
  TipoMarcacao,
} from '@sistema/shared';
import { of } from 'rxjs';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { PaginaPontoFuncionarioComponent } from './pagina-ponto-funcionario.component';
import { PontoService } from './ponto.service';

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

function dia(parcial: Partial<DiaPontoResponse>): DiaPontoResponse {
  return {
    id: 'd-1',
    periodoId: 'p-1',
    funcionarioId: 'f-ana',
    data: '2026-12-07',
    ocorrencia: OcorrenciaDia.NORMAL,
    statusEnvio: StatusEnvioDia.NAO_ENVIADO,
    marcacoes: [],
    observacao: null,
    minutosTrabalhados: 480,
    minutosExtras50: 0,
    minutosExtras100: 0,
    minutosNoturnos: 0,
    minutosAtraso: 0,
    minutosFalta: 0,
    apuradoEm: null,
    editavel: true,
    atualizadoEm: '2026-12-07T12:00:00.000Z',
    ...parcial,
  };
}

/** Semana de 07/12/2026 (segunda) a 13/12/2026 (domingo). */
function resposta(parcial: Partial<PontoFuncionarioResponse> = {}): PontoFuncionarioResponse {
  return {
    funcionarioId: 'f-ana',
    funcionarioNome: 'Ana Lima',
    matricula: '001',
    inicio: '2026-12-07',
    fim: '2026-12-13',
    periodos: [PERIODO],
    dias: [dia({ data: '2026-12-07' })],
    jornadaPorDia: { '2026-12-07': JORNADA, '2026-12-08': JORNADA },
    feriados: { '2026-12-08': 'Nossa Senhora da Conceicao' },
    totais: {
      minutosTrabalhados: 480,
      minutosExtras50: 0,
      minutosExtras100: 0,
      minutosNoturnos: 0,
      minutosAtraso: 0,
      minutosFalta: 0,
    },
    ...parcial,
  };
}

describe('PaginaPontoFuncionarioComponent (T-037)', () => {
  let fixture: ComponentFixture<PaginaPontoFuncionarioComponent>;
  let componente: PaginaPontoFuncionarioComponent;
  let consultas: { inicio: string; fim: string }[];
  let enviados: LancarFuncionarioRequest[];
  let atual: PontoFuncionarioResponse;
  let retorno: LancarPontoResponse;

  async function montar(): Promise<void> {
    consultas = [];
    enviados = [];
    retorno = { salvos: 0, dias: [], erros: [] };

    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [PaginaPontoFuncionarioComponent],
      providers: [
        {
          provide: PontoService,
          useValue: {
            porFuncionario: (_id: string, inicio: string, fim: string) => {
              consultas.push({ inicio, fim });
              return of({ ...atual, inicio, fim });
            },
            lancarFuncionario: (_id: string, dados: LancarFuncionarioRequest) => {
              enviados.push(dados);
              return of(retorno);
            },
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'f-ana' }) } },
        },
        {
          provide: NotificacaoService,
          useValue: { sucesso: () => undefined, erro: () => undefined },
        },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginaPontoFuncionarioComponent);
    componente = fixture.componentInstance;
    await fixture.whenStable();
  }

  beforeEach(() => {
    atual = resposta();
    // Congela somente o relogio: `Date` fixo deixa a navegacao de semana e mes
    // previsivel, e os temporizadores continuam reais para o Angular conseguir
    // estabilizar o componente.
    jest.useFakeTimers({
      now: new Date('2026-12-09T12:00:00.000Z'),
      doNotFake: [
        'cancelAnimationFrame',
        'cancelIdleCallback',
        'clearImmediate',
        'clearInterval',
        'clearTimeout',
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'requestIdleCallback',
        'setImmediate',
        'setInterval',
        'setTimeout',
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('abre na semana da data de referencia, de segunda a domingo', async () => {
    await montar();

    expect(consultas[0]).toEqual({ inicio: '2026-12-07', fim: '2026-12-13' });
    expect(componente.visao()).toBe('SEMANA');
  });

  it('monta uma linha por dia do intervalo, inclusive os dias sem lancamento', async () => {
    await montar();

    expect(componente.linhasDia()).toHaveLength(7);
    expect(componente.linhasDia()[0]?.dia?.data).toBe('2026-12-07');
    expect(componente.linhasDia()[1]?.dia).toBeNull();
    expect(componente.linhasDia()[1]?.feriado).toBe('Nossa Senhora da Conceicao');
    expect(componente.linhas.length).toBe(7);
  });

  it('troca para a visao mensal usando o mes cheio (RN-01)', async () => {
    await montar();

    componente.trocarVisao('MES');

    expect(consultas.at(-1)).toEqual({ inicio: '2026-12-01', fim: '2026-12-31' });
  });

  it('navega por semana e por mes', async () => {
    await montar();

    componente.navegar(1);
    expect(consultas.at(-1)).toEqual({ inicio: '2026-12-14', fim: '2026-12-20' });

    componente.trocarVisao('MES');
    componente.navegar(-1);
    expect(consultas.at(-1)).toEqual({ inicio: '2026-11-01', fim: '2026-11-30' });
  });

  it('envia somente os dias alterados', async () => {
    await montar();

    componente.grupoDa(2).patchValue({ entrada: '07:00', saida: '17:00' });
    componente.salvar();

    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.dias).toEqual([
      {
        data: '2026-12-09',
        ocorrencia: OcorrenciaDia.NORMAL,
        observacao: null,
        entrada: '07:00',
        saidaIntervalo: null,
        retornoIntervalo: null,
        saida: '17:00',
      },
    ]);
  });

  it('desabilita o dia que a API marcou como nao editavel (RN-07)', async () => {
    atual = resposta({ dias: [dia({ data: '2026-12-07', editavel: false })] });

    await montar();

    expect(componente.grupoDa(0).disabled).toBe(true);
  });

  it('agrupa por data os erros devolvidos pela API (T-038)', async () => {
    await montar();
    retorno = {
      salvos: 0,
      dias: [],
      erros: [
        {
          funcionarioId: 'f-ana',
          data: '2026-12-09',
          campo: TipoMarcacao.RETORNO_INTERVALO,
          motivo: 'Informe a saida e o retorno do intervalo juntos.',
        },
      ],
    };

    componente.grupoDa(2).patchValue({ saidaIntervalo: '11:00' });
    componente.salvar();

    expect(componente.errosDe('2026-12-09')).toHaveLength(1);
    expect(componente.errosDe('2026-12-07')).toEqual([]);
  });

  it('exibe os totais que a API calculou, sem recalcular', async () => {
    await montar();

    expect(componente.duracao(componente.dados()?.totais.minutosTrabalhados ?? 0)).toBe('8h');
  });
});
