import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** Avisos curtos ao usuario. Centralizado para manter o mesmo comportamento em todas as telas. */
@Injectable({ providedIn: 'root' })
export class NotificacaoService {
  private readonly snackBar = inject(MatSnackBar);

  erro(mensagem: string): void {
    this.snackBar.open(mensagem, 'Fechar', {
      duration: 8000,
      panelClass: 'notificacao-erro',
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }

  sucesso(mensagem: string): void {
    this.snackBar.open(mensagem, 'Fechar', {
      duration: 4000,
      panelClass: 'notificacao-sucesso',
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }
}
