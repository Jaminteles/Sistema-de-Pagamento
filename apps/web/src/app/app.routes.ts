import type { Routes } from '@angular/router';
import { PerfilUsuario } from '@sistema/shared';
import {
  autenticadoGuard,
  perfilGuard,
  PERFIS_DA_ROTA,
  visitanteGuard,
} from './core/auth/auth.guards';
import { LayoutPrincipalComponent } from './core/layout/layout-principal.component';

/**
 * Rotas da aplicacao (T-013).
 *
 * O login fica fora do layout; todo o resto exige sessao ativa. `data.perfis`
 * esconde a tela de quem nao usa - a autorizacao de verdade e sempre a do
 * back-end (guard de JWT + guard de perfil em cada endpoint).
 */
export const routes: Routes = [
  {
    path: 'login',
    title: 'Entrar | Ponto e Pagamento',
    canActivate: [visitanteGuard],
    loadComponent: () =>
      import('./features/login/pagina-login.component').then((m) => m.PaginaLoginComponent),
  },
  {
    path: '',
    component: LayoutPrincipalComponent,
    canActivate: [autenticadoGuard],
    canActivateChild: [perfilGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio | Ponto e Pagamento',
        loadComponent: () =>
          import('./features/inicio/pagina-inicio.component').then((m) => m.PaginaInicioComponent),
      },
      {
        path: 'usuarios',
        title: 'Usuarios | Ponto e Pagamento',
        data: { [PERFIS_DA_ROTA]: [PerfilUsuario.ADMIN] },
        loadComponent: () =>
          import('./features/usuarios/pagina-usuarios.component').then(
            (m) => m.PaginaUsuariosComponent,
          ),
      },
      {
        path: 'usuarios/novo',
        title: 'Novo usuario | Ponto e Pagamento',
        data: { [PERFIS_DA_ROTA]: [PerfilUsuario.ADMIN] },
        loadComponent: () =>
          import('./features/usuarios/pagina-usuario-form.component').then(
            (m) => m.PaginaUsuarioFormComponent,
          ),
      },
      {
        path: 'usuarios/:id/senha',
        title: 'Redefinir senha | Ponto e Pagamento',
        data: { [PERFIS_DA_ROTA]: [PerfilUsuario.ADMIN] },
        loadComponent: () =>
          import('./features/usuarios/pagina-redefinir-senha.component').then(
            (m) => m.PaginaRedefinirSenhaComponent,
          ),
      },
      {
        path: 'usuarios/:id',
        title: 'Editar usuario | Ponto e Pagamento',
        data: { [PERFIS_DA_ROTA]: [PerfilUsuario.ADMIN] },
        loadComponent: () =>
          import('./features/usuarios/pagina-usuario-form.component').then(
            (m) => m.PaginaUsuarioFormComponent,
          ),
      },
      {
        path: 'conta/senha',
        title: 'Trocar senha | Ponto e Pagamento',
        loadComponent: () =>
          import('./features/conta/pagina-trocar-senha.component').then(
            (m) => m.PaginaTrocarSenhaComponent,
          ),
      },
      {
        path: '**',
        title: 'Pagina nao encontrada',
        loadComponent: () =>
          import('./features/nao-encontrado/pagina-nao-encontrado.component').then(
            (m) => m.PaginaNaoEncontradoComponent,
          ),
      },
    ],
  },
];
