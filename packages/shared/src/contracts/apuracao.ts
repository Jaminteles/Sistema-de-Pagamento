import type { PeriodoResponse, TotaisPontoResponse } from './ponto.js';

/**
 * Contratos da apuracao (M4, sprint 6).
 *
 * O motor de apuracao (RF-020) vive no back-end e e a unica fonte dos minutos:
 * horas trabalhadas, extras 50% e 100%, adicional noturno, atrasos e faltas. O
 * front-end exibe o que a API calculou e nao refaz conta nenhuma.
 *
 * Toda duracao e minuto inteiro. Percentual em dinheiro nao aparece aqui: o
 * valor a pagar e dos modulos M5 e M6.
 */

/** POST /api/ponto/periodos/:id/apuracao (RF-020). */
export interface ApurarPeriodoResponse {
  periodo: PeriodoResponse;
  /** Dias recalculados agora. */
  dias: number;
  funcionarios: number;
  /** Soma dos dias recalculados, em minutos inteiros. */
  totais: TotaisPontoResponse;
}
