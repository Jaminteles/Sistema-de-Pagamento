import { inject } from '@angular/core';
import {
  type ActivatedRouteSnapshot,
  type CanActivateChildFn,
  type CanActivateFn,
  Router,
  type RouterStateSnapshot,
} from '@angular/router';
import type { PerfilUsuario } from '@sistema/shared';
import { NotificacaoService } from '../notificacao/notificacao.service';
import { AuthService } from './auth.service';
import { PARAMETRO_RETORNO, ROTA_INICIAL, ROTA_LOGIN } from './rotas-auth';

/**
 * Chave usada no `data` da rota para listar os perfis que a acessam:
 *
 *   { path: 'usuarios', data: { [PERFIS_DA_ROTA]: ['ADMIN'] }, ... }
 */
export const PERFIS_DA_ROTA = 'perfis';

/**
 * Exige sessao ativa (T-013).
 *
 * A sessao e restaurada pelo cookie de refresh antes de o roteador iniciar, por
 * isso aqui basta consultar o estado em memoria.
 */
export const autenticadoGuard: CanActivateFn = (
  _rota: ActivatedRouteSnapshot,
  estado: RouterStateSnapshot,
) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.autenticado()) {
    return true;
  }

  return router.createUrlTree([ROTA_LOGIN], {
    queryParams: { [PARAMETRO_RETORNO]: estado.url },
  });
};

/** Mantem quem ja esta logado fora da tela de login. */
export const visitanteGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.autenticado() ? router.createUrlTree([ROTA_INICIAL]) : true;
};

/**
 * Restringe a rota aos perfis declarados em `data.perfis` (T-013).
 *
 * Esconder a rota e apenas experiencia de uso: o guard de perfil do back-end
 * continua sendo o que decide. Uma rota sem `data.perfis` e liberada para
 * qualquer usuario autenticado.
 */
export const perfilGuard: CanActivateChildFn & CanActivateFn = (rota: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notificacao = inject(NotificacaoService);

  const permitidos = rota.data[PERFIS_DA_ROTA] as readonly PerfilUsuario[] | undefined;

  if (!permitidos || permitidos.length === 0) {
    return true;
  }

  if (auth.temAlgumPerfil(permitidos)) {
    return true;
  }

  notificacao.erro('Voce nao tem permissao para acessar esta tela.');
  return router.createUrlTree([ROTA_INICIAL]);
};
