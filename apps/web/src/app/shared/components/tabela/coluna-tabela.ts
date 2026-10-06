/** Alinhamento da coluna. Valores monetarios e horas alinham a direita. */
export type AlinhamentoColuna = 'inicio' | 'fim';

/**
 * Descricao de uma coluna da tabela reutilizavel.
 *
 * `valor` recebe a linha e devolve o texto a exibir. Toda formatacao
 * (BRL, horas, data) acontece aqui, no front, sobre o que a API calculou.
 */
export interface ColunaTabela<T> {
  chave: string;
  titulo: string;
  valor: (linha: T) => string;
  alinhamento?: AlinhamentoColuna;
  /** Oculta a coluna em telas estreitas (a grade de ponto e mobile-first). */
  ocultarNoCelular?: boolean;
}
