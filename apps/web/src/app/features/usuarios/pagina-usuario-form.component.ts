import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import {
  type AtualizarUsuarioRequest,
  PERFIL_USUARIO_LABEL,
  PERFIS_USUARIO,
  type PerfilUsuario,
  SENHA_TAMANHO_MAXIMO,
  SENHA_TAMANHO_MINIMO,
  USUARIO_EMAIL_TAMANHO_MAXIMO,
  USUARIO_NOME_TAMANHO_MAXIMO,
  type UsuarioResponse,
} from '@sistema/shared';
import { AuthService } from '../../core/auth/auth.service';
import { mensagemDoErro } from '../../core/http/erro-api';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { CampoTextoComponent } from '../../shared/components/campo-texto/campo-texto.component';
import { EstadoConteudoComponent } from '../../shared/components/estado-conteudo/estado-conteudo.component';
import { UsuariosService } from './usuarios.service';

/**
 * Cadastro e edicao de usuario, e redefinicao de senha pelo admin
 * (T-014 / RF-002, RF-004).
 *
 * O e-mail nao e editavel, acompanhando o DTO do back-end: ele identifica o
 * usuario no login e no log de auditoria.
 */
@Component({
  selector: 'app-pagina-usuario-form',
  imports: [
    CampoTextoComponent,
    EstadoConteudoComponent,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-usuario-form.component.scss',
  templateUrl: './pagina-usuario-form.component.html',
})
export class PaginaUsuarioFormComponent {
  /** Vem do parametro de rota; ausente na criacao. */
  readonly id = input<string | undefined>(undefined);

  private readonly servico = inject(UsuariosService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificacao = inject(NotificacaoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly perfis = PERFIS_USUARIO;
  readonly rotuloPerfil = PERFIL_USUARIO_LABEL;
  readonly tamanhoMinimoSenha = SENHA_TAMANHO_MINIMO;
  readonly tamanhoMaximoSenha = SENHA_TAMANHO_MAXIMO;
  readonly tamanhoMaximoNome = USUARIO_NOME_TAMANHO_MAXIMO;
  readonly tamanhoMaximoEmail = USUARIO_EMAIL_TAMANHO_MAXIMO;

  readonly carregando = signal(false);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly usuario = signal<UsuarioResponse | null>(null);

  readonly edicao = computed(() => this.id() !== undefined);
  readonly titulo = computed(() => (this.edicao() ? 'Editar usuario' : 'Novo usuario'));
  /** O back-end recusa alterar o proprio perfil ou a propria situacao. */
  readonly ePropriaConta = computed(() => this.id() !== undefined && this.id() === this.auth.usuario()?.id);

  readonly form = this.formBuilder.group({
    nome: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(USUARIO_NOME_TAMANHO_MAXIMO),
    ]),
    email: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.email,
      Validators.maxLength(USUARIO_EMAIL_TAMANHO_MAXIMO),
    ]),
    senha: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.minLength(SENHA_TAMANHO_MINIMO),
      Validators.maxLength(SENHA_TAMANHO_MAXIMO),
    ]),
    perfil: this.formBuilder.control<PerfilUsuario | null>(null, [Validators.required]),
    ativo: this.formBuilder.control<boolean>(true, { nonNullable: true }),
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (id === undefined) {
        this.prepararCriacao();
        return;
      }
      this.carregar(id);
    });
  }

  private prepararCriacao(): void {
    this.usuario.set(null);
    this.form.reset({ ativo: true });
    this.form.controls.email.enable();
    this.form.controls.senha.enable();
  }

  private carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);

    // Na edicao o e-mail e somente leitura e a senha tem acao propria.
    this.form.controls.email.disable();
    this.form.controls.senha.disable();

    this.servico
      .buscar(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (usuario) => {
          this.usuario.set(usuario);
          this.form.patchValue({
            nome: usuario.nome,
            email: usuario.email,
            perfil: usuario.perfil,
            ativo: usuario.ativo,
          });
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(this.mensagem(erro, 'Nao foi possivel carregar o usuario.'));
          this.carregando.set(false);
        },
      });
  }

  salvar(): void {
    if (this.enviando()) {
      return;
    }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    const id = this.id();
    if (id === undefined) {
      this.criar();
      return;
    }
    this.atualizar(id);
  }

  private criar(): void {
    const { nome, email, senha, perfil } = this.form.getRawValue();
    if (nome === null || email === null || senha === null || perfil === null) {
      return;
    }

    this.enviando.set(true);

    this.servico
      .criar({ nome, email, senha, perfil })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.notificacao.sucesso('Usuario criado.');
          void this.router.navigate(['/usuarios']);
        },
        error: (erro: unknown) => this.tratarFalhaDeEnvio(erro),
      });
  }

  private atualizar(id: string): void {
    const atual = this.usuario();
    const { nome, perfil, ativo } = this.form.getRawValue();
    if (atual === null || nome === null || perfil === null) {
      return;
    }

    // Envia somente o que mudou: menos superficie e auditoria mais legivel.
    const alteracoes: AtualizarUsuarioRequest = {
      ...(nome === atual.nome ? {} : { nome }),
      ...(perfil === atual.perfil ? {} : { perfil }),
      ...(ativo === atual.ativo ? {} : { ativo }),
    };

    if (Object.keys(alteracoes).length === 0) {
      this.notificacao.sucesso('Nada a alterar.');
      return;
    }

    this.enviando.set(true);

    this.servico
      .atualizar(id, alteracoes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (atualizado) => {
          this.enviando.set(false);
          this.usuario.set(atualizado);
          this.notificacao.sucesso('Usuario atualizado.');
          void this.router.navigate(['/usuarios']);
        },
        error: (erro: unknown) => this.tratarFalhaDeEnvio(erro),
      });
  }

  /** A propria tela de redefinicao pede a confirmacao e explica o efeito. */
  redefinirSenha(): void {
    const id = this.id();
    if (id === undefined) {
      return;
    }
    void this.router.navigate(['/usuarios', id, 'senha']);
  }

  cancelar(): void {
    void this.router.navigate(['/usuarios']);
  }

  private tratarFalhaDeEnvio(erro: unknown): void {
    this.enviando.set(false);
    this.notificacao.erro(this.mensagem(erro, 'Nao foi possivel salvar o usuario.'));
  }

  private mensagem(erro: unknown, padrao: string): string {
    return erro instanceof HttpErrorResponse ? mensagemDoErro(erro) : padrao;
  }
}
