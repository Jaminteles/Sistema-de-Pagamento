import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom, map } from 'rxjs';
import { ModalConfirmacaoComponent } from './modal-confirmacao.component';
import type { DadosConfirmacao } from './modal-confirmacao.model';

/** Abre o modal de confirmacao e resolve com true somente se o usuario confirmar. */
@Injectable({ providedIn: 'root' })
export class ConfirmacaoService {
  private readonly dialog = inject(MatDialog);

  confirmar(dados: DadosConfirmacao): Promise<boolean> {
    const referencia = this.dialog.open<ModalConfirmacaoComponent, DadosConfirmacao, boolean>(
      ModalConfirmacaoComponent,
      {
        data: dados,
        width: '26rem',
        maxWidth: 'calc(100vw - 2rem)',
        autoFocus: 'dialog',
        restoreFocus: true,
      },
    );

    return firstValueFrom(referencia.afterClosed().pipe(map((confirmado) => confirmado === true)));
  }
}
