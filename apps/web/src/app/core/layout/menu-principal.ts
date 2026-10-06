import type { PerfilUsuario } from '@sistema/shared';

/**
 * Item do menu lateral.
 *
 * `perfis` serve apenas para esconder o que o usuario nao usa: autorizacao de
 * verdade e sempre no back-end (guard de JWT + guard de perfil). O filtro por
 * perfil do usuario autenticado entra no T-013.
 */
export interface ItemMenu {
  rota: string;
  rotulo: string;
  icone: string;
  perfis: readonly PerfilUsuario[];
}

export const MENU_PRINCIPAL: readonly ItemMenu[] = [
  {
    rota: '/inicio',
    rotulo: 'Inicio',
    icone: 'home',
    perfis: ['ADMIN', 'RH', 'ENCARREGADO', 'FINANCEIRO'],
  },
];
