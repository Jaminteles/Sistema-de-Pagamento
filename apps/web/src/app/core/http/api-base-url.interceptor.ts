import { type HttpInterceptorFn } from '@angular/common/http';
import { API_BASE_URL } from '../core.config';

/**
 * Prefixa com /api as requisicoes que usam caminho relativo
 * (ex.: 'usuarios' -> '/api/usuarios'). URLs absolutas passam sem alteracao.
 */
export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (/^https?:\/\//i.test(req.url) || req.url.startsWith(API_BASE_URL)) {
    return next(req);
  }

  const caminho = req.url.startsWith('/') ? req.url : `/${req.url}`;
  return next(req.clone({ url: `${API_BASE_URL}${caminho}` }));
};
