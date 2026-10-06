import { BadRequestException, HttpStatus, InternalServerErrorException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { ApiErrorResponse } from '@sistema/shared';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface HostFalso {
  host: ArgumentsHost;
  corpo: () => ApiErrorResponse;
  status: () => number;
}

function criarHost(url = '/api/exemplo', headers: Record<string, string> = {}): HostFalso {
  let statusRecebido = 0;
  let corpoRecebido: ApiErrorResponse | undefined;

  const response = {
    setHeader: (): void => undefined,
    status: (valor: number) => {
      statusRecebido = valor;
      return {
        json: (corpo: ApiErrorResponse): void => {
          corpoRecebido = corpo;
        },
      };
    },
  };

  const request = { url, originalUrl: url, method: 'POST', headers };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return {
    host,
    corpo: () => {
      if (!corpoRecebido) {
        throw new Error('Filtro nao escreveu corpo na resposta.');
      }
      return corpoRecebido;
    },
    status: () => statusRecebido,
  };
}

describe('AllExceptionsFilter', () => {
  const filtro = new AllExceptionsFilter();

  it('devolve as mensagens de validacao em details', () => {
    const alvo = criarHost();

    filtro.catch(new BadRequestException(['email deve ser um e-mail valido']), alvo.host);

    expect(alvo.status()).toBe(HttpStatus.BAD_REQUEST);
    expect(alvo.corpo().details).toEqual(['email deve ser um e-mail valido']);
    expect(alvo.corpo().message).toBe('Dados invalidos na requisicao.');
  });

  it('nao expoe detalhe interno em erro 500', () => {
    const alvo = criarHost();
    jest.spyOn(filtro['logger'], 'error').mockImplementation(() => undefined);

    filtro.catch(new InternalServerErrorException('relation "usuario" does not exist'), alvo.host);

    expect(alvo.status()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(alvo.corpo().message).toBe('Erro interno do servidor.');
    expect(JSON.stringify(alvo.corpo())).not.toContain('usuario');
  });

  it('nao expoe detalhe interno de erro desconhecido', () => {
    const alvo = criarHost();
    jest.spyOn(filtro['logger'], 'error').mockImplementation(() => undefined);

    filtro.catch(new Error('senha_hash invalida para admin@empresa.com'), alvo.host);

    expect(alvo.status()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(alvo.corpo())).not.toContain('senha_hash');
    expect(JSON.stringify(alvo.corpo())).not.toContain('admin@empresa.com');
  });

  it('reaproveita o x-request-id quando ele e seguro', () => {
    const alvo = criarHost('/api/exemplo', { 'x-request-id': 'abc-123' });

    filtro.catch(new BadRequestException('invalido'), alvo.host);

    expect(alvo.corpo().requestId).toBe('abc-123');
  });

  it('descarta x-request-id com conteudo suspeito', () => {
    const alvo = criarHost('/api/exemplo', { 'x-request-id': '<script>alert(1)</script>' });

    filtro.catch(new BadRequestException('invalido'), alvo.host);

    expect(alvo.corpo().requestId).not.toContain('<script>');
  });
});
