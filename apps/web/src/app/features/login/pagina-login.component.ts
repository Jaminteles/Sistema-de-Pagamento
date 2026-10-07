import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { SENHA_TAMANHO_MAXIMO, USUARIO_EMAIL_TAMANHO_MAXIMO } from '@sistema/shared';
import { AuthService } from '../../core/auth/auth.service';
import { PARAMETRO_RETORNO, ROTA_INICIAL } from '../../core/auth/rotas-auth';
import { mensagemDoErro } from '../../core/http/erro-api';
import { CampoTextoComponent } from '../../shared/components/campo-texto/campo-texto.component';
import { ERRO_SERVIDOR } from '../../shared/forms/mensagem-erro';

/**
 * Tela de login (T-012 / RF-001).
 *
 * As validacoes espelham o LoginDto do back-end; quem decide de verdade e a
 * API. A mensagem de falha e a mesma que a API devolve, sem dizer se o e-mail
 * existe.
 */
@Component({
  selector: 'app-pagina-login',
  imports: [
    CampoTextoComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-login.component.scss',
  templateUrl: './pagina-login.component.html',
})
export class PaginaLoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly tamanhoMaximoEmail = USUARIO_EMAIL_TAMANHO_MAXIMO;
  readonly tamanhoMaximoSenha = SENHA_TAMANHO_MAXIMO;

  readonly form = this.formBuilder.group({
    email: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.email,
      Validators.maxLength(USUARIO_EMAIL_TAMANHO_MAXIMO),
    ]),
    senha: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.maxLength(SENHA_TAMANHO_MAXIMO),
    ]),
  });

  entrar(): void {
    if (this.enviando()) {
      return;
    }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    const { email, senha } = this.form.getRawValue();
    if (email === null || senha === null) {
      return;
    }

    this.enviando.set(true);
    this.erro.set(null);

    this.auth
      .login({ email, senha })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          void this.router.navigateByUrl(this.destinoAposLogin());
        },
        error: (erro: unknown) => {
          this.enviando.set(false);
          const mensagem =
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel entrar. Tente novamente.';

          this.erro.set(mensagem);
          // A senha sai do formulario; o e-mail fica para o usuario corrigir.
          this.form.controls.senha.reset();
          this.form.controls.senha.setErrors({ [ERRO_SERVIDOR]: mensagem });
        },
      });
  }

  /**
   * Volta para a rota que exigiu login, quando houver.
   *
   * Somente caminho interno: um `retorno` com URL absoluta seria porta de
   * redirecionamento aberto.
   */
  private destinoAposLogin(): string {
    const retorno = this.router.routerState.snapshot.root.queryParamMap.get(PARAMETRO_RETORNO);

    if (retorno && retorno.startsWith('/') && !retorno.startsWith('//')) {
      return retorno;
    }

    return ROTA_INICIAL;
  }
}
