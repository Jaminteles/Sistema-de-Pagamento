/**
 * Apoio de tempo compartilhado entre a API e o front-end.
 *
 * Aqui so entram conversoes de formato e rotulos de exibicao. Nenhuma regra de
 * apuracao (tolerancia, extras, noturno) vive neste arquivo: isso e do motor de
 * apuracao, no back-end.
 */

export const MINUTOS_NO_DIA = 1440;

/** Dias da semana em ISO-8601: 1 = segunda ... 7 = domingo. */
export const DIAS_SEMANA: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

export const DIA_SEMANA_LABEL: Readonly<Record<number, string>> = {
  1: 'Segunda',
  2: 'Terca',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sabado',
  7: 'Domingo',
};

export const DIA_SEMANA_ABREVIADO: Readonly<Record<number, string>> = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sab',
  7: 'Dom',
};

/** Minutos desde a meia-noite para "HH:MM". Sem validacao de faixa. */
export function minutosParaHora(minutos: number): string {
  const normalizado = ((Math.trunc(minutos) % MINUTOS_NO_DIA) + MINUTOS_NO_DIA) % MINUTOS_NO_DIA;
  const horas = Math.floor(normalizado / 60);
  const resto = normalizado % 60;
  return `${String(horas).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}

/** "HH:MM" para minutos desde a meia-noite. Devolve null quando invalido. */
export function horaParaMinutos(hora: string): number | null {
  const casamento = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora.trim());
  if (!casamento) {
    return null;
  }
  return Number(casamento[1]) * 60 + Number(casamento[2]);
}

/**
 * Duracao entre dois horarios em minutos, aceitando virada de meia-noite
 * (turno da noite). Devolve 0 quando entrada e saida coincidem.
 */
export function duracaoEmMinutos(entradaMinutos: number, saidaMinutos: number): number {
  return (((saidaMinutos - entradaMinutos) % MINUTOS_NO_DIA) + MINUTOS_NO_DIA) % MINUTOS_NO_DIA;
}

/** Minutos inteiros para "7h 30min". Usado somente na exibicao. */
export function minutosParaDuracao(minutos: number): string {
  const total = Math.max(0, Math.trunc(minutos));
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas === 0) {
    return `${resto}min`;
  }
  return resto === 0 ? `${horas}h` : `${horas}h ${resto}min`;
}

/** Data em "AAAA-MM-DD" (o formato que a API usa para `date`). */
export const PADRAO_DATA_ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Verdadeiro quando a string e uma data "AAAA-MM-DD" existente no calendario. */
export function dataIsoValida(valor: string): boolean {
  if (!PADRAO_DATA_ISO.test(valor)) {
    return false;
  }
  const [ano, mes, dia] = valor.split('-').map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
}
