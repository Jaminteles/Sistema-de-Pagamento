import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorResponse } from '@sistema/shared';
import { MENSAGEM_ERRO_GENERICA, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from './erro-api';

function erroCom(corpo: unknown, status = 400): HttpErrorResponse {
  return new HttpErrorResponse({ error: corpo, status, url: '/api/exemplo' });
}

describe('mensagemDoErro', () => {
  it('usa a mensagem do contrato ApiErrorResponse', () => {
    const corpo: ApiErrorResponse = {
      statusCode: 409,
      message: 'Matricula ja cadastrada.',
      error: 'Conflict',
      timestamp: '2026-10-06T12:00:00.000Z',
      path: '/api/funcionarios',
      requestId: 'req-1',
    };

    expect(mensagemDoErro(erroCom(corpo, 409))).toBe('Matricula ja cadastrada.');
  });

  it('prefere os detalhes de validacao quando existem', () => {
    const corpo: ApiErrorResponse = {
      statusCode: 400,
      message: 'Dados invalidos na requisicao.',
      error: 'Bad Request',
      details: ['cpf deve ter 11 digitos'],
      timestamp: '2026-10-06T12:00:00.000Z',
      path: '/api/funcionarios',
      requestId: 'req-2',
    };

    expect(mensagemDoErro(erroCom(corpo, 400))).toBe('cpf deve ter 11 digitos');
  });

  it('avisa falta de conexao quando o status e 0', () => {
    expect(mensagemDoErro(erroCom(null, 0))).toBe(MENSAGEM_SEM_CONEXAO);
  });

  it('usa mensagem generica quando o corpo nao segue o contrato', () => {
    expect(mensagemDoErro(erroCom('<html>Bad Gateway</html>', 502))).toBe(MENSAGEM_ERRO_GENERICA);
  });
});
