import { DIA_SEMANA_ABREVIADO, LOCALE_PADRAO, TIMEZONE_NEGOCIO } from '@sistema/shared';

/**
 * Apoio de calendario das telas de ponto.
 *
 * Aqui so existe navegacao e exibicao: qual e o dia de hoje, qual e a semana ou
 * o mes de uma data e como mostrar isso. Nenhuma regra de apuracao - essa e do
 * back-end (RF-020).
 *
 * Todas as funcoes trabalham com "AAAA-MM-DD" em UTC para que a conta de dias
 * nao escorregue com o fuso do navegador.
 */

const FORMATADOR_HOJE = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hoje no fuso de negocio America/Bahia (RNF-12), em "AAAA-MM-DD". */
export function hojeIso(agora: Date = new Date()): string {
  return FORMATADOR_HOJE.format(agora);
}

function paraData(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  return paraIso(new Date(paraData(iso).getTime() + dias * 86_400_000));
}

/** Dia da semana em ISO-8601: 1 = segunda ... 7 = domingo. */
export function diaSemanaIso(iso: string): number {
  const domingoZero = paraData(iso).getUTCDay();
  return domingoZero === 0 ? 7 : domingoZero;
}

export function abreviacaoDoDia(iso: string): string {
  return DIA_SEMANA_ABREVIADO[diaSemanaIso(iso)] ?? '';
}

/** Semana de segunda a domingo que contem a data. */
export function semanaDe(iso: string): { inicio: string; fim: string } {
  const inicio = somarDias(iso, -(diaSemanaIso(iso) - 1));
  return { inicio, fim: somarDias(inicio, 6) };
}

/** Mes cheio que contem a data (o mesmo recorte do periodo, RN-01). */
export function mesDe(iso: string): { inicio: string; fim: string } {
  const data = paraData(iso);
  const inicio = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + 1, 0));
  return { inicio: paraIso(inicio), fim: paraIso(fim) };
}

/** "07/12/2026". */
export function formatarData(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE_PADRAO, { timeZone: 'UTC' }).format(paraData(iso));
}

/** "07/12". */
export function formatarDiaMes(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE_PADRAO, {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
  }).format(paraData(iso));
}

/** "AAAA-MM" da data, para abrir o periodo correspondente. */
export function competenciaDe(iso: string): string {
  return iso.slice(0, 7);
}

/** Todas as datas de `inicio` a `fim`, inclusive, em "AAAA-MM-DD". */
export function datasEntre(inicio: string, fim: string): string[] {
  const datas: string[] = [];
  for (let dia = inicio; dia <= fim; dia = somarDias(dia, 1)) {
    datas.push(dia);
  }
  return datas;
}

/**
 * Primeiro dia do mes vizinho (sentido -1 ou 1).
 *
 * Somar 30 dias erraria o mes em fevereiro e nos meses de 31 dias; aqui a conta
 * e feita no mes, nao no dia.
 */
export function mesVizinho(iso: string, sentido: number): string {
  const data = paraData(iso);
  return paraIso(new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + sentido, 1)));
}
