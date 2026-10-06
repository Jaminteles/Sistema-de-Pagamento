import type { Routes } from '@angular/router';
import { LayoutPrincipalComponent } from './core/layout/layout-principal.component';

/**
 * As telas por modulo entram nas sprints seguintes, cada uma com seu guard de
 * rota (T-013). Esconder rota e apenas experiencia de uso: a autorizacao de
 * verdade e sempre no back-end.
 */
export const routes: Routes = [
  {
    path: '',
    component: LayoutPrincipalComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        title: 'Inicio | Ponto e Pagamento',
        loadComponent: () =>
          import('./features/inicio/pagina-inicio.component').then((m) => m.PaginaInicioComponent),
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
