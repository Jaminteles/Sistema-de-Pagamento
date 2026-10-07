/** Parametros de paginacao aceitos pelas listagens da API. */
export interface ParametrosPaginacao {
  /** Pagina solicitada, comecando em 1. */
  pagina?: number;
  /** Registros por pagina. */
  tamanho?: number;
}

/** Envelope padrao das listagens paginadas da API. */
export interface RespostaPaginada<T> {
  itens: T[];
  total: number;
  pagina: number;
  tamanho: number;
}

/** Valores padrao e limites da paginacao, espelhados nos DTOs do back-end. */
export const PAGINACAO_TAMANHO_PADRAO = 20;
export const PAGINACAO_TAMANHO_MAXIMO = 100;
