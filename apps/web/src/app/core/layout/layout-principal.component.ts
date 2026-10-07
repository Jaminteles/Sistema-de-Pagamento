import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PERFIL_USUARIO_LABEL } from '@sistema/shared';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ROTA_LOGIN } from '../auth/rotas-auth';
import { menuDoPerfil } from './menu-principal';

/** Abaixo disso o menu vira gaveta sobreposta (RNF-01: uso no celular da obra). */
const LARGURA_CELULAR = '(max-width: 959.98px)';

@Component({
  selector: 'app-layout-principal',
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatSidenavModule,
    MatToolbarModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './layout-principal.component.scss',
  templateUrl: './layout-principal.component.html',
})
export class LayoutPrincipalComponent {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** toSignal encerra a inscricao junto com o componente. */
  readonly celular = toSignal(
    this.breakpoints.observe(LARGURA_CELULAR).pipe(map((estado) => estado.matches)),
    { initialValue: false },
  );

  readonly usuario = this.auth.usuario;
  /** O menu mostra somente o que o perfil do usuario usa (T-013). */
  readonly itens = computed(() => menuDoPerfil(this.auth.perfil()));
  readonly rotuloPerfil = computed(() => {
    const perfil = this.auth.perfil();
    return perfil === null ? '' : PERFIL_USUARIO_LABEL[perfil];
  });

  private readonly gavetaAberta = signal(false);

  readonly modo = computed<'over' | 'side'>(() => (this.celular() ? 'over' : 'side'));
  readonly aberta = computed(() => (this.celular() ? this.gavetaAberta() : true));

  alternarMenu(): void {
    this.gavetaAberta.update((valor) => !valor);
  }

  fecharSeCelular(): void {
    if (this.celular()) {
      this.gavetaAberta.set(false);
    }
  }

  sair(): void {
    this.auth
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.router.navigate([ROTA_LOGIN]);
      });
  }
}
