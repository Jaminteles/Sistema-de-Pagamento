import { API_PREFIX } from '@sistema/shared';
import type { CookieOptions, Response } from 'express';

/** Nome do cookie httpOnly que carrega o refresh token. */
export const COOKIE_REFRESH = 'refresh_token';

/**
 * O cookie e restrito ao caminho das rotas de sessao: nenhuma outra rota da API
 * recebe o refresh token, e nada de JavaScript do front-end consegue le-lo.
 */
export const CAMINHO_COOKIE_REFRESH = `/${API_PREFIX}/auth`;

/**
 * SameSite=strict fecha a porta de CSRF entre sites; o front e a API ficam na
 * mesma origem (proxy do ng serve em desenvolvimento, Nginx em producao).
 * `secure` sai apenas em producao, onde o HTTPS e obrigatorio (RNF-03).
 */
function opcoes(producao: boolean, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: producao,
    sameSite: 'strict',
    path: CAMINHO_COOKIE_REFRESH,
    ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
  };
}

export function definirCookieRefresh(
  resposta: Response,
  token: string,
  validadeDias: number,
  producao: boolean,
): void {
  const maxAgeMs = validadeDias * 24 * 60 * 60 * 1000;
  resposta.cookie(COOKIE_REFRESH, token, opcoes(producao, maxAgeMs));
}

export function limparCookieRefresh(resposta: Response, producao: boolean): void {
  resposta.clearCookie(COOKIE_REFRESH, opcoes(producao));
}

/** Le o refresh token do cookie. Devolve null quando ausente ou fora do formato. */
export function lerCookieRefresh(cookies: unknown): string | null {
  if (typeof cookies !== 'object' || cookies === null) {
    return null;
  }
  const valor = (cookies as Record<string, unknown>)[COOKIE_REFRESH];
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}
