import {
  duracaoEmMinutos,
  MINUTOS_NO_DIA,
  OcorrenciaDia,
  type TipoMarcacao,
  TipoMarcacao as Tipos,
  type TotaisPontoResponse,
} from '@sistema/shared';

/**
 * Motor de apuracao diaria (T-043 / RF-020).
 *
 * Funcao pura: recebe o dia resolvido em minutos e devolve os totais em minutos
 * inteiros. Sem banco, sem Nest e sem data do sistema - e a regra mais
 * exercitada do projeto (RNF-10) e precisa ser testavel caso a caso.
 *
 * Regras aplicadas, na ordem:
 *   - RN-02: tolerancia diaria da jornada (padrao 10 minutos, CLT art. 58 par.
 *     1). Dentro dela nao ha atraso nem extra; passando dela, conta o excedente
 *     inteiro, nao a diferenca descontada da tolerancia;
 *   - RN-03: extra em dia util vale 50%; em domingo ou feriado, 100%. Aqui so
 *     se separam os minutos: o percentual em dinheiro e dos modulos M5 e M6;
 *   - RN-04: trabalho entre 22h e 5h gera adicional noturno. A hora noturna
 *     reduzida de 52min30 nao entra - o que se guarda e minuto trabalhado na
 *     faixa, como o Levantamento de Requisitos pede.
 *
 * Nenhum valor financeiro passa por aqui.
 */

/** Inicio da faixa noturna em minutos do dia (22:00). */
const NOTURNO_INICIO = 22 * 60;
/** Fim da faixa noturna, contado desde a mesma meia-noite (05:00 do dia seguinte). */
const NOTURNO_FIM = NOTURNO_INICIO + 7 * 60;

/** Marcacao ja resolvida: minutos desde a meia-noite do dia do ponto. */
export interface MarcacaoApuracao {
  tipo: TipoMarcacao;
  /** Pode passar de 1440 no turno que vira a meia-noite. */
  absoluto: number;
}

/** O que a jornada do vinculo vigente diz sobre o dia (RF-009). */
export interface JornadaApuracao {
  entradaMinutos: number;
  saidaMinutos: number;
  intervaloMinutos: number;
  toleranciaMinutos: number;
  /** ISO-8601: 1 = segunda ... 7 = domingo. */
  diasSemana: readonly number[];
}

export interface DiaApuracao {
  /** ISO-8601: 1 = segunda ... 7 = domingo. */
  diaSemana: number;
  feriado: boolean;
  ocorrencia: OcorrenciaDia;
  /** Nulo quando o dia nao tem vinculo vigente: nada e previsto nem cobrado. */
  jornada: JornadaApuracao | null;
  marcacoes: readonly MarcacaoApuracao[];
}

/** Intervalo efetivamente trabalhado, em minutos desde a meia-noite do dia. */
export interface Trecho {
  inicio: number;
  fim: number;
}

const ZERADO: TotaisPontoResponse = {
  minutosTrabalhados: 0,
  minutosExtras50: 0,
  minutosExtras100: 0,
  minutosNoturnos: 0,
  minutosAtraso: 0,
  minutosFalta: 0,
};

function horarioDe(marcacoes: readonly MarcacaoApuracao[], tipo: TipoMarcacao): number | undefined {
  return marcacoes.find((marcacao) => marcacao.tipo === tipo)?.absoluto;
}

/**
 * Trechos trabalhados do dia.
 *
 * Dia completo rende dois trechos (antes e depois do intervalo). Dia sem
 * intervalo rende um. Marcacao pela metade - so entrada, ou intervalo aberto
 * sem saida - rende o que da para fechar: o resto e pendencia de lancamento, nao
 * trabalho presumido.
 */
export function trechosTrabalhados(marcacoes: readonly MarcacaoApuracao[]): Trecho[] {
  const entrada = horarioDe(marcacoes, Tipos.ENTRADA);
  const saidaIntervalo = horarioDe(marcacoes, Tipos.SAIDA_INTERVALO);
  const retornoIntervalo = horarioDe(marcacoes, Tipos.RETORNO_INTERVALO);
  const saida = horarioDe(marcacoes, Tipos.SAIDA);

  if (entrada === undefined) {
    return [];
  }

  const trechos: Trecho[] = [];

  if (saidaIntervalo !== undefined) {
    trechos.push({ inicio: entrada, fim: saidaIntervalo });
    if (retornoIntervalo !== undefined && saida !== undefined) {
      trechos.push({ inicio: retornoIntervalo, fim: saida });
    }
  } else if (saida !== undefined) {
    trechos.push({ inicio: entrada, fim: saida });
  }

  return trechos.filter((trecho) => trecho.fim > trecho.inicio);
}

/** Minutos previstos pela jornada naquele dia (RN-01, RN-03). */
export function minutosPrevistos(dia: DiaApuracao): number {
  const jornada = dia.jornada;
  if (jornada === null || dia.feriado || !jornada.diasSemana.includes(dia.diaSemana)) {
    // Feriado e dia fora da escala nao preveem trabalho: o que for lancado ali e
    // extra integral, e a ausencia nao e falta.
    return 0;
  }
  const bruto = duracaoEmMinutos(jornada.entradaMinutos, jornada.saidaMinutos);
  return Math.max(0, bruto - Math.max(0, jornada.intervaloMinutos));
}

/** Minutos de um trecho que caem na faixa noturna de 22h as 5h (RN-04). */
export function minutosNoturnosDoTrecho(trecho: Trecho): number {
  let total = 0;

  // Tres janelas cobrem qualquer trecho dentro da janela maxima do dia: a
  // noite anterior (madrugada deste dia), a deste dia e a do dia seguinte.
  for (const deslocamento of [-1, 0, 1]) {
    const inicioJanela = NOTURNO_INICIO + deslocamento * MINUTOS_NO_DIA;
    const fimJanela = NOTURNO_FIM + deslocamento * MINUTOS_NO_DIA;
    const inicio = Math.max(trecho.inicio, inicioJanela);
    const fim = Math.min(trecho.fim, fimJanela);
    if (fim > inicio) {
      total += fim - inicio;
    }
  }

  return total;
}

/**
 * Apura um dia de ponto (RF-020).
 *
 * Ocorrencia diferente de NORMAL nao tem horario (RF-015): ali o dia rende, no
 * maximo, minutos de falta. FALTA e a unica que desconta - atestado, folga,
 * ferias, afastamento e falta justificada sao abonos, e tratar qualquer uma
 * delas como desconto erraria o pagamento.
 */
export function apurarDia(dia: DiaApuracao): TotaisPontoResponse {
  const previsto = minutosPrevistos(dia);

  if (dia.ocorrencia !== OcorrenciaDia.NORMAL) {
    return {
      ...ZERADO,
      minutosFalta: dia.ocorrencia === OcorrenciaDia.FALTA ? previsto : 0,
    };
  }

  const trechos = trechosTrabalhados(dia.marcacoes);
  if (trechos.length === 0) {
    // Dia normal sem marcacao fechada nao e falta: e dia nao lancado, e quem
    // cobra isso e o painel de pendencias do periodo (RF-022).
    return { ...ZERADO };
  }

  const trabalhados = trechos.reduce((total, trecho) => total + (trecho.fim - trecho.inicio), 0);
  const noturnos = trechos.reduce((total, trecho) => total + minutosNoturnosDoTrecho(trecho), 0);

  const tolerancia = Math.max(0, dia.jornada?.toleranciaMinutos ?? 0);
  const diferenca = trabalhados - previsto;

  const excedente = diferenca > tolerancia ? diferenca : 0;
  const atraso = diferenca < -tolerancia ? -diferenca : 0;

  // RN-03: domingo e feriado pagam 100%; dia util, 50%.
  const dobrado = dia.feriado || dia.diaSemana === 7;

  return {
    minutosTrabalhados: trabalhados,
    minutosExtras50: dobrado ? 0 : excedente,
    minutosExtras100: dobrado ? excedente : 0,
    minutosNoturnos: noturnos,
    minutosAtraso: atraso,
    minutosFalta: 0,
  };
}
