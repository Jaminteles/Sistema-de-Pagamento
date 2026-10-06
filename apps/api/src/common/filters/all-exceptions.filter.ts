import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorResponse } from '@sistema/shared';
import type { Request, Response } from 'express';

/** Comparacoes numericas de status: evita misturar number com o enum HttpStatus. */
const ERRO_SERVIDOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

/**
 * Tratamento centralizado de erros.
 *
 * Garante que a API nunca devolva stack trace, SQL, nome de tabela ou dado
 * pessoal. Erros 5xx vao para o log do servidor com requestId; o cliente recebe
 * mensagem genérica.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = this.lerRequestId(request);
    // originalUrl preserva o prefixo global; request.url chega sem ele.
    const caminho = request.originalUrl || request.url;
    const status = this.lerStatus(exception);
    const { message, error, details } = this.lerCorpo(exception, status);

    if (status >= ERRO_SERVIDOR) {
      // Somente no log do servidor: nunca no corpo da resposta.
      this.logger.error(
        `[${requestId}] ${request.method} ${caminho} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const corpo: ApiErrorResponse = {
      statusCode: status,
      message,
      error,
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: caminho,
      requestId,
    };

    response.setHeader('x-request-id', requestId);
    response.status(status).json(corpo);
  }

  private lerRequestId(request: Request): string {
    const header = request.headers['x-request-id'];
    const valor = Array.isArray(header) ? header[0] : header;
    // Nao confiamos no valor do cliente além de 64 caracteres seguros.
    if (typeof valor === 'string' && /^[\w-]{1,64}$/.test(valor)) {
      return valor;
    }
    return randomUUID();
  }

  private lerStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return ERRO_SERVIDOR;
  }

  private lerCorpo(
    exception: unknown,
    status: number,
  ): { message: string; error: string; details?: string[] } {
    if (status >= ERRO_SERVIDOR || !(exception instanceof HttpException)) {
      return { message: 'Erro interno do servidor.', error: 'Internal Server Error' };
    }

    const resposta = exception.getResponse();

    if (typeof resposta === 'string') {
      return { message: resposta, error: exception.name };
    }

    const objeto = resposta as { message?: unknown; error?: unknown };
    const mensagens = Array.isArray(objeto.message)
      ? objeto.message.map((item) => String(item))
      : undefined;

    if (mensagens) {
      return {
        message: 'Dados invalidos na requisicao.',
        error: typeof objeto.error === 'string' ? objeto.error : exception.name,
        details: mensagens,
      };
    }

    return {
      message: typeof objeto.message === 'string' ? objeto.message : exception.message,
      error: typeof objeto.error === 'string' ? objeto.error : exception.name,
    };
  }
}
