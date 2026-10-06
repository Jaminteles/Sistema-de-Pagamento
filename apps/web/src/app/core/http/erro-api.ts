import type { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorResponse } from '@sistema/shared';

/** Mensagem exibida quando a API nao respondeu ou respondeu fora do contrato. */
export const MENSAGEM_ERRO_GENERICA = 'Nao foi possivel concluir a operacao. Tente novamente.';
export const MENSAGEM_SEM_CONEXAO = 'Sem conexao com o servidor.';

function pareceApiError(valor: unknown): valor is ApiErrorResponse {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const corpo = valor as Partial<ApiErrorResponse>;
  return typeof corpo.message === 'string' && typeof corpo.statusCode === 'number';
}

/**
 * Extrai uma mensagem exibivel do erro HTTP, sempre a partir do contrato
 * ApiErrorResponse. Nunca mostra stack, corpo bruto nem URL interna.
 */
export function mensagemDoErro(erro: HttpErrorResponse): string {
  if (erro.status === 0) {
    return MENSAGEM_SEM_CONEXAO;
  }

  const corpo: unknown = erro.error;

  if (pareceApiError(corpo)) {
    const detalhes = corpo.details;
    if (detalhes && detalhes.length > 0) {
      return detalhes.join(' ');
    }
    return corpo.message;
  }

  return MENSAGEM_ERRO_GENERICA;
}
