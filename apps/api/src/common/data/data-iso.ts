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
