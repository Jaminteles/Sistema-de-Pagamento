import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import type { DadosConfirmacao } from './modal-confirmacao.model';

/** Modal base do projeto. Toda acao irreversivel passa por aqui. */
@Component({
  selector: 'app-modal-confirmacao',
  imports: [MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ dados.titulo }}</h2>
    <mat-dialog-content>
      <p>{{ dados.mensagem }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" (click)="dialogRef.close(false)">
        {{ dados.textoCancelar ?? 'Cancelar' }}
      </button>
      <button
        matButton="filled"
        type="button"
        cdkFocusInitial
        [class.acao-perigosa]="dados.perigoso"
        (click)="dialogRef.close(true)"
      >
        {{ dados.textoConfirmar ?? 'Confirmar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .acao-perigosa {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ModalConfirmacaoComponent {
  readonly dialogRef = inject<MatDialogRef<ModalConfirmacaoComponent, boolean>>(MatDialogRef);
  readonly dados = inject<DadosConfirmacao>(MAT_DIALOG_DATA);
}
