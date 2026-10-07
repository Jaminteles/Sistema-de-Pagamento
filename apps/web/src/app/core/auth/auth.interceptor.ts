import {
  HttpErrorResponse,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { NotificacaoService } from '../notificacao/notificacao.service';
import { AuthService } from './auth.service';
import { ROTA_LOGIN } from './rotas-auth';

/** Rotas de sessao: nao recebem Authorization e nao disparam nova renovacao. */
const ROTAS_DE_SESSAO = ['/auth/login', '/auth/refresh', '/auth/logout'];

function eRotaDeSessao(url: string): boolean {
  return ROTAS_DE_SESSAO.some((rota) => url.includes(rota));
}

function comToken<T>(requisicao: HttpRequest<T>, token: string): HttpRequest<T> {
  return requisicao.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Anexa o access token, renova a sessao quando ele vence e trata 401/403
 * (T-012).
 *
 * Em 401 numa rota comum, tenta renovar uma unica vez e repete a requisicao. Se
 * a renovacao falhar, a sessao e esquecida e o usuario vai para a tela de login
 * com a rota de origem guardada.
 */
export const authInterceptor: HttpInterceptorFn = (requisicao, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notificacao = inject(NotificacaoService);

  const sessao = eRotaDeSessao(requisicao.url);
  const token = auth.tokenAtual();
  const comCredencial = sessao || !token ? requisicao : comToken(requisicao, token);

  return next(comCredencial).pipe(
    catchError((erro: unknown) => {
      if (!(erro instanceof HttpErrorResponse)) {
        return throwError(() => erro);
      }

      if (erro.status === 403) {
        notificacao.erro('Voce nao tem permissao para esta acao.');
        return throwError(() => erro);
      }

      if (erro.status !== 401 || sessao) {
        return throwError(() => erro);
      }

      return auth.renovar().pipe(
        switchMap((novoToken) => {
          if (!novoToken) {
            return throwError(() => erro);
          }
          return next(comToken(requisicao, novoToken));
        }),
        catchError(() => {
          auth.encerrarLocalmente();
          void router.navigate([ROTA_LOGIN], {
            queryParams: { retorno: router.url },
          });
          return throwError(() => erro);
        }),
      );
    }),
  );
};
