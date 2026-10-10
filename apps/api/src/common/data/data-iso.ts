/**
 * Conversao entre "AAAA-MM-DD" e `Date` para colunas `date` do PostgreSQL.
 *
 * Sempre em UTC: uma coluna `date` nao tem horario, e converter no fuso local
 * do servidor deslocaria o dia gravado. O fuso de negocio America/Bahia
 * (RNF-12) vale para marcacao e apuracao, que sao timestamptz - nao aqui.
 */

/** "2026-11-23" para a meia-noite UTC do mesmo dia. */
export function dataIsoParaDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Coluna `date` para "AAAA-MM-DD". */
export function dateParaDataIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Dia seguinte (ou anterior, com `dias` negativo) de uma coluna `date`. */
export function adicionarDias(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * 86_400_000);
}

/** Dia da semana em ISO-8601: 1 = segunda ... 7 = domingo. */
export function diaSemanaIso(data: Date): number {
  const domingoZero = data.getUTCDay();
  return domingoZero === 0 ? 7 : domingoZero;
}

/** Dias inteiros entre duas colunas `date`. */
export function diasEntre(inicio: Date, fim: Date): number {
  return Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);
}

/** Todas as datas de `inicio` a `fim`, inclusive. */
export function datasDoIntervalo(inicio: Date, fim: Date): Date[] {
  const datas: Date[] = [];
  for (let dia = inicio; dia <= fim; dia = adicionarDias(dia, 1)) {
    datas.push(dia);
  }
  return datas;
}

/** Competencia "AAAA-MM" valida no calendario. */
export const PADRAO_COMPETENCIA = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Primeiro e ultimo dia do mes da competencia (RN-01).
 *
 * O dia de corte configuravel e da sprint 11 (RF-039); aqui o periodo e sempre
 * o mes cheio.
 */
export function intervaloDaCompetencia(competencia: string): { inicio: Date; fim: Date } {
  const [ano, mes] = competencia.split('-').map(Number) as [number, number];
  return {
    inicio: new Date(Date.UTC(ano, mes - 1, 1)),
    // Dia 0 do mes seguinte e o ultimo dia deste mes.
    fim: new Date(Date.UTC(ano, mes, 0)),
  };
}
