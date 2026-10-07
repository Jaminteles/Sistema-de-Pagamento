import type { Request } from 'express';
import type { OrigemRequisicao } from '../common/auditoria/auditoria.types';

/**
 * IP e user agent para a auditoria.
 *
 * `request.ip` ja vem resolvido porque o bootstrap confia em um salto de proxy
 * (o Nginx do Compose repassa X-Forwarded-For).
 */
export function origemDa(requisicao: Request): OrigemRequisicao {
  const userAgent = requisicao.headers['user-agent'];
  return {
    ip: requisicao.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent : null,
  };
}
