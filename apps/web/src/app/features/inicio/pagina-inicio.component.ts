import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import type { HealthResponse } from '@sistema/shared';
import { TIMEZONE_NEGOCIO } from '@sistema/shared';
import { mensagemDoErro } from '../../core/http/erro-api';
import { EstadoConteudoComponent } from '../../shared/components/estado-conteudo/estado-conteudo.component';
import { InicioService } from './inicio.service';

/**
 * Tela inicial da fundacao: confirma que o front, a API e o banco estao
 * conversando. O painel por perfil com pendencias e lotes e o T-080.
 */
@Component({
  selector: 'app-pagina-inicio',
  imports: [EstadoConteudoComponent, MatCardModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-inicio.component.scss',
  templateUrl: './pagina-inicio.component.html',
})
export class PaginaInicioComponent {
  private readonly servico = inject(InicioService);
  private readonly destroyRef = inject(DestroyRef);

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly saude = signal<HealthResponse | null>(null);

  readonly fusoNegocio = TIMEZONE_NEGOCIO;

  constructor() {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.servico
      .consultarSaude()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.saude.set(resposta);
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel consultar a API.',
          );
          this.carregando.set(false);
        },
      });
  }
}
