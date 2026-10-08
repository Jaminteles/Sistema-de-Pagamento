/**
 * Feriados nacionais para a carga inicial do calendario (RF-011).
 *
 * Entram apenas os feriados nacionais previstos em lei:
 *   - Lei 662/1949 e Lei 10.607/2002 (datas fixas);
 *   - Lei 6.802/1980 (Nossa Senhora Aparecida);
 *   - Lei 14.759/2023 (20 de novembro, Consciencia Negra);
 *   - Sexta-feira Santa, feriado religioso de data movel.
 *
 * Carnaval e Corpus Christi NAO entram: sao ponto facultativo, nao feriado
 * nacional. Marcar um dia como feriado muda a apuracao (RN-03: extra a 100%),
 * por isso quem decide observa-los cadastra manualmente.
 */

export interface FeriadoNacional {
  /** Data em "AAAA-MM-DD". */
  data: string;
  descricao: string;
}

interface DataFixa {
  mes: number;
  dia: number;
  descricao: string;
}

const DATAS_FIXAS: readonly DataFixa[] = [
  { mes: 1, dia: 1, descricao: 'Confraternizacao Universal' },
  { mes: 4, dia: 21, descricao: 'Tiradentes' },
  { mes: 5, dia: 1, descricao: 'Dia do Trabalho' },
  { mes: 9, dia: 7, descricao: 'Independencia do Brasil' },
  { mes: 10, dia: 12, descricao: 'Nossa Senhora Aparecida' },
  { mes: 11, dia: 2, descricao: 'Finados' },
  { mes: 11, dia: 15, descricao: 'Proclamacao da Republica' },
  { mes: 11, dia: 20, descricao: 'Dia Nacional de Zumbi e da Consciencia Negra' },
  { mes: 12, dia: 25, descricao: 'Natal' },
];

function formatar(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Domingo de Pascoa pelo algoritmo de Meeus/Jones/Butcher (calendario
 * gregoriano). Devolve mes (1-12) e dia.
 */
export function domingoDePascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

/** Data em "AAAA-MM-DD" deslocada em dias a partir de uma data do mesmo ano. */
function deslocar(ano: number, mes: number, dia: number, dias: number): string {
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() + dias);
  return formatar(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate());
}

/** Feriados nacionais do ano, ordenados por data. */
export function feriadosNacionais(ano: number): FeriadoNacional[] {
  const pascoa = domingoDePascoa(ano);

  const itens: FeriadoNacional[] = [
    ...DATAS_FIXAS.map((item) => ({
      data: formatar(ano, item.mes, item.dia),
      descricao: item.descricao,
    })),
    { data: deslocar(ano, pascoa.mes, pascoa.dia, -2), descricao: 'Sexta-feira Santa' },
  ];

  return itens.sort((a, b) => a.data.localeCompare(b.data));
}
