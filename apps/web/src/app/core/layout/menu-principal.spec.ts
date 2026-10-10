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

  it('mostra Funcionarios para todos os perfis com sessao (T-028)', () => {
    for (const perfil of Object.values(PerfilUsuario)) {
      expect(rotas(perfil)).toContain('/funcionarios');
    }
  });

  it('esconde Jornadas e Feriados do encarregado e do financeiro', () => {
    for (const perfil of [PerfilUsuario.ENCARREGADO, PerfilUsuario.FINANCEIRO]) {
      expect(rotas(perfil)).not.toContain('/jornadas');
      expect(rotas(perfil)).not.toContain('/feriados');
    }
  });

  it('mostra Lancamento de ponto para quem lanca ponto (T-036)', () => {
    for (const perfil of [PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO]) {
      expect(rotas(perfil)).toContain('/ponto');
    }
    expect(rotas(PerfilUsuario.FINANCEIRO)).not.toContain('/ponto');
  });

  it('nao mostra nada sem sessao', () => {
    expect(menuDoPerfil(null)).toEqual([]);
  });
});
