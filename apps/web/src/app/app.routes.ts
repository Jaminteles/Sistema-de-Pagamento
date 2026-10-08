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
        path: 'obras',
        title: 'Obras | Ponto e Pagamento',
        // O encarregado ve somente as obras vinculadas a ele (RN-05); o recorte
        // e feito pela API, a partir do usuario autenticado.
        data: {
          [PERFIS_DA_ROTA]: [
            PerfilUsuario.ADMIN,
            PerfilUsuario.RH,
            PerfilUsuario.ENCARREGADO,
          ],
        },
        loadComponent: () =>
          import('./features/obras/pagina-obras.component').then((m) => m.PaginaObrasComponent),
      },
      {
        path: 'obras/nova',
        title: 'Nova obra | Ponto e Pagamento',
        data: { [PERFIS_DA_ROTA]: [PerfilUsuario.ADMIN, PerfilUsuario.RH] },
        loadComponent: () =>
          import('./features/obras/pagina-obra-form.component').then(
            (m) => m.PaginaObraFormComponent,
          ),
      },
      {
        path: 'obras/:id',
        title: 'Editar obra | Ponto e Pagamento',
        data: { [PERFIS_DA_ROTA]: [PerfilUsuario.ADMIN, PerfilUsuario.RH] },
        loadComponent: () =>
          import('./features/obras/pagina-obra-form.component').then(
            (m) => m.PaginaObraFormComponent,
          ),
      },
      {
        path: 'jornadas',
        title: 'Jornadas | Ponto e Pagamento',
        data: { [PERFIS_DA_ROTA]: [PerfilUsuario.ADMIN, PerfilUsuario.RH] },
        loadComponent: () =>
          import('./features/jornadas/pagina-jornadas.component').then(
            (m) => m.PaginaJornadasComponent,
          ),
      },
      {
        path: 'jornadas/nova',
        title: 'Nova jornada | Ponto e Pagamento',
        data: { [PERFIS_DA_ROTA]: [PerfilUsuario.ADMIN, PerfilUsuario.RH] },
        loadComponent: () =>
          import('./features/jornadas/pagina-jornada-form.component').then(
            (m) => m.PaginaJornadaFormComponent,
          ),
      },
      {
        path: 'jornadas/:id',
        title: 'Editar jornada | Ponto e Pagamento',
        data: { [PERFIS_DA_ROTA]: [PerfilUsuario.ADMIN, PerfilUsuario.RH] },
        loadComponent: () =>
          import('./features/jornadas/pagina-jornada-form.component').then(
            (m) => m.PaginaJornadaFormComponent,
          ),
      },
      {
        path: 'feriados',
        title: 'Feriados | Ponto e Pagamento',
        data: { [PERFIS_DA_ROTA]: [PerfilUsuario.ADMIN, PerfilUsuario.RH] },
        loadComponent: () =>
          import('./features/feriados/pagina-feriados.component').then(
            (m) => m.PaginaFeriadosComponent,
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
