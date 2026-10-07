import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { SENHA_TAMANHO_MAXIMO, SENHA_TAMANHO_MINIMO } from '@sistema/shared';
import { AuthService } from '../../core/auth/auth.service';
import { ROTA_LOGIN } from '../../core/auth/rotas-auth';
import { mensagemDoErro } from '../../core/http/erro-api';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { CampoTextoComponent } from '../../shared/components/campo-texto/campo-texto.component';
import { ERRO_SERVIDOR } from '../../shared/forms/mensagem-erro';

/**
 * Troca da propria senha (T-014 / RF-004).
 *
 * O back-end encerra todas as sessoes do usuario, inclusive esta, por isso a
 * tela leva de volta ao login depois do sucesso.
 */
@Component({
  selector: 'app-pagina-trocar-senha',
  imports: [CampoTextoComponent, MatButtonModule, MatCardModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-trocar-senha.component.scss',
  templateUrl: './pagina-trocar-senha.component.html',
})
export class PaginaTrocarSenhaComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificacao = inject(NotificacaoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly enviando = signal(false);
  readonly tamanhoMinimoSenha = SENHA_TAMANHO_MINIMO;
  readonly tamanhoMaximoSenha = SENHA_TAMANHO_MAXIMO;

  readonly form = this.formBuilder.group({
    senhaAtual: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.maxLength(SENHA_TAMANHO_MAXIMO),
    ]),
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

    const { senhaAtual, novaSenha } = this.form.getRawValue();
    if (senhaAtual === null || novaSenha === null) {
      return;
    }

    if (senhaAtual === novaSenha) {
      this.form.controls.novaSenha.setErrors({
        [ERRO_SERVIDOR]: 'A nova senha precisa ser diferente da atual.',
      });
      return;
    }

    this.enviando.set(true);

    this.auth
      .trocarSenha({ senhaAtual, novaSenha })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.form.reset();
          this.notificacao.sucesso('Senha alterada. Entre novamente com a senha nova.');
          void this.router.navigate([ROTA_LOGIN]);
        },
        error: (erro: unknown) => {
          this.enviando.set(false);
          const mensagem =
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel alterar a senha.';

          this.form.controls.senhaAtual.reset();
          this.form.controls.senhaAtual.setErrors({ [ERRO_SERVIDOR]: mensagem });
        },
      });
  }
}
