import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * Estados de carregando, vazio e erro exigidos em toda tela.
 * O conteudo real so aparece quando nenhum dos tres estados esta ativo.
 */
@Component({
  selector: 'app-estado-conteudo',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './estado-conteudo.component.scss',
  template: `
    @if (carregando()) {
      <div class="estado" role="status" aria-live="polite">
        <mat-spinner diameter="40" />
        <p>{{ mensagemCarregando() }}</p>
      </div>
    } @else if (erro()) {
      <div class="estado estado--erro" role="alert">
        <mat-icon aria-hidden="true">error_outline</mat-icon>
        <p>{{ erro() }}</p>
        <button matButton="outlined" type="button" (click)="recarregar.emit()">
          Tentar novamente
        </button>
      </div>
    } @else if (vazio()) {
      <div class="estado">
        <mat-icon aria-hidden="true">inbox</mat-icon>
        <p>{{ mensagemVazio() }}</p>
      </div>
    } @else {
      <ng-content />
    }
  `,
})
export class EstadoConteudoComponent {
  readonly carregando = input(false);
  readonly erro = input<string | null>(null);
  readonly vazio = input(false);
  readonly mensagemCarregando = input('Carregando...');
  readonly mensagemVazio = input('Nenhum registro encontrado.');

  readonly recarregar = output<void>();
}
