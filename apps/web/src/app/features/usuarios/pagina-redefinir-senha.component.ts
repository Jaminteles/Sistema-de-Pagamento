import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { SENHA_TAMANHO_MAXIMO, SENHA_TAMANHO_MINIMO } from '@sistema/shared';
import { mensagemDoErro } from '../../core/http/erro-api';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { CampoTextoComponent } from '../../shared/components/campo-texto/campo-texto.component';
import { UsuariosService } from './usuarios.service';

/**
 * Redefinicao de senha de outro usuario, pelo admin (T-014 / RF-004).
 *
 * A senha nova e digitada aqui e combinada com o usuario por fora do sistema:
 * o projeto nao envia e-mail. Todas as sessoes abertas do usuario caem.
 */
@Component({
  selector: 'app-pagina-redefinir-senha',
  imports: [CampoTextoComponent, MatButtonModule, MatCardModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-redefinir-senha.component.scss',
  templateUrl: './pagina-redefinir-senha.component.html',
})
export class PaginaRedefinirSenhaComponent {
  readonly id = input.required<string>();

  private readonly servico = inject(UsuariosService);
  private readonly router = inject(Router);
  private readonly notificacao = inject(NotificacaoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly enviando = signal(false);
  readonly tamanhoMinimoSenha = SENHA_TAMANHO_MINIMO;
  readonly tamanhoMaximoSenha = SENHA_TAMANHO_MAXIMO;

  readonly form = this.formBuilder.group({
    novaSenha: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.minLength(SENHA_TAMANHO_MINIMO),
      Validators.maxLength(SENHA_TAMANHO_MAXIMO),
    ]),
  });

  salvar(): void {
    if (this.enviando()) {
      return;
    }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    const novaSenha = this.form.controls.novaSenha.value;
    if (novaSenha === null) {
      return;
    }

    this.enviando.set(true);

    this.servico
      .redefinirSenha(this.id(), { novaSenha })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.form.reset();
          this.notificacao.sucesso('Senha redefinida. As sessoes do usuario foram encerradas.');
          void this.router.navigate(['/usuarios', this.id()]);
        },
        error: (erro: unknown) => {
          this.enviando.set(false);
          this.notificacao.erro(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel redefinir a senha.',
          );
        },
      });
  }

  cancelar(): void {
    void this.router.navigate(['/usuarios', this.id()]);
  }
}
