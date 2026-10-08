import { DIA_SEMANA_ABREVIADO } from '@sistema/shared';

/** Celula do calendario. `dataIso` vazio marca o preenchimento antes do dia 1. */
export interface CelulaCalendario {
  dia: number | null;
  dataIso: string;
  /** Dia da semana em ISO-8601 (1 = segunda ... 7 = domingo). */
  diaSemana: number;
}

export interface MesCalendario {
  mes: number;
  rotulo: string;
  celulas: CelulaCalendario[];
}

export const MESES_LABEL: readonly string[] = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Cabecalho do calendario, de segunda a domingo. */
export const CABECALHO_SEMANA: readonly string[] = [1, 2, 3, 4, 5, 6, 7].map(
  (dia) => DIA_SEMANA_ABREVIADO[dia] ?? '',
);

function dataIso(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Monta os 12 meses do ano em semanas que comecam na segunda-feira.
 *
 * Tudo em UTC de proposito: o calendario exibe dias do calendario, nao
 * instantes, e usar UTC evita o mes "pular" conforme o fuso do navegador.
 */
export function calendarioDoAno(ano: number): MesCalendario[] {
  return MESES_LABEL.map((rotulo, indice) => {
    const mes = indice + 1;
    const primeiro = new Date(Date.UTC(ano, indice, 1));
    const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

    // getUTCDay devolve 0 para domingo; ISO-8601 usa 7.
    const diaSemanaDoPrimeiro = primeiro.getUTCDay() === 0 ? 7 : primeiro.getUTCDay();

    const celulas: CelulaCalendario[] = [];

    for (let vazio = 1; vazio < diaSemanaDoPrimeiro; vazio += 1) {
      celulas.push({ dia: null, dataIso: '', diaSemana: vazio });
    }

    for (let dia = 1; dia <= diasNoMes; dia += 1) {
      const data = new Date(Date.UTC(ano, indice, dia));
      celulas.push({
        dia,
        dataIso: dataIso(ano, mes, dia),
        diaSemana: data.getUTCDay() === 0 ? 7 : data.getUTCDay(),
      });
    }

    return { mes, rotulo, celulas };
  });
}
