import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificacaoService } from '../notificacao/notificacao.service';
import { mensagemDoErro } from './erro-api';

/**
 * Avisa o usuario sobre falhas de servidor e rede e repassa o erro para quem
 * chamou, que decide o estado de erro da tela.
 *
 * 4xx de validacao (400/409/422) nao viram aviso global: a tela mostra o erro
 * no proprio formulario. 401 e 403 ganham tratamento de sessao no T-012.
 */
const STATUS_TRATADOS_NA_TELA = new Set([400, 401, 403, 409, 422]);

export const erroHttpInterceptor: HttpInterceptorFn = (req, next) => {
  const notificacao = inject(NotificacaoService);

  return next(req).pipe(
    catchError((erro: unknown) => {
      if (erro instanceof HttpErrorResponse && !STATUS_TRATADOS_NA_TELA.has(erro.status)) {
        notificacao.erro(mensagemDoErro(erro));
      }
      return throwError(() => erro);
    }),
  );
};
