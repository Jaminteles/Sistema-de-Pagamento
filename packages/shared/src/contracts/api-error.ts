/**
 * Formato unico de erro da API, produzido pelo filtro global de excecoes.
 * Nunca carrega stack trace, SQL, nome de tabela ou dado pessoal.
 */
export interface ApiErrorResponse {
  /** Status HTTP repetido no corpo para facilitar o tratamento no front. */
  statusCode: number;
  /** Mensagem pronta para exibicao ao usuario. */
  message: string;
  /** Rotulo curto e estavel do erro (ex.: "Bad Request"). */
  error: string;
  /** Mensagens de validacao campo a campo, quando houver. */
  details?: string[];
  /** Momento do erro em ISO-8601 (UTC). */
  timestamp: string;
  /** Caminho requisitado. */
  path: string;
  /** Identificador da requisicao, para correlacionar com o log do servidor. */
  requestId: string;
}
