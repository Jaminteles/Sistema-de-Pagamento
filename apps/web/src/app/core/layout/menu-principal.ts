import { PERFIS_USUARIO, type PerfilUsuario } from '@sistema/shared';

/**
 * Item do menu lateral.
 *
 * `perfis` serve apenas para esconder o que o usuario nao usa: autorizacao de
 * verdade e sempre no back-end (guard de JWT + guard de perfil).
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
    perfis: PERFIS_USUARIO,
  },
  {
    rota: '/usuarios',
    rotulo: 'Usuarios',
    icone: 'group',
    perfis: ['ADMIN'],
  },
];

/** Itens visiveis para o perfil informado. Sem perfil, nenhum item (T-013). */
export function menuDoPerfil(perfil: PerfilUsuario | null): readonly ItemMenu[] {
  if (perfil === null) {
    return [];
  }
  return MENU_PRINCIPAL.filter((item) => item.perfis.includes(perfil));
}
