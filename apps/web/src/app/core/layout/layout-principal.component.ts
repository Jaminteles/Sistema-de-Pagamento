import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { MENU_PRINCIPAL } from './menu-principal';

/** Abaixo disso o menu vira gaveta sobreposta (RNF-01: uso no celular da obra). */
const LARGURA_CELULAR = '(max-width: 959.98px)';

@Component({
  selector: 'app-layout-principal',
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
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

  /** toSignal encerra a inscricao junto com o componente. */
  readonly celular = toSignal(
    this.breakpoints.observe(LARGURA_CELULAR).pipe(map((estado) => estado.matches)),
    { initialValue: false },
  );

  readonly itens = MENU_PRINCIPAL;

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
}
