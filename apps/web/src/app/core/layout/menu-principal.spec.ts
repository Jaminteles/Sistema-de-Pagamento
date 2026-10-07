import { PerfilUsuario } from '@sistema/shared';
import { menuDoPerfil } from './menu-principal';

/**
 * O menu e filtrado por perfil (T-013). Esconder item e apenas experiencia de
 * uso: o back-end continua recusando quem nao tem permissao.
 */
describe('menuDoPerfil', () => {
  function rotas(perfil: PerfilUsuario | null): string[] {
    return menuDoPerfil(perfil).map((item) => item.rota);
  }

  it('mostra Usuarios somente para o ADMIN', () => {
    expect(rotas(PerfilUsuario.ADMIN)).toContain('/usuarios');
  });

  it.each([
    ['RH', PerfilUsuario.RH],
    ['ENCARREGADO', PerfilUsuario.ENCARREGADO],
    ['FINANCEIRO', PerfilUsuario.FINANCEIRO],
  ])('esconde Usuarios para %s', (_nome, perfil) => {
    expect(rotas(perfil)).not.toContain('/usuarios');
  });

  it('mostra Inicio para todos os perfis', () => {
    for (const perfil of Object.values(PerfilUsuario)) {
      expect(rotas(perfil)).toContain('/inicio');
    }
  });

  it('nao mostra nada sem sessao', () => {
    expect(menuDoPerfil(null)).toEqual([]);
  });
});
