import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
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
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import {
  type AtualizarObraRequest,
  type EncarregadoObraResponse,
  OBRA_ENDERECO_TAMANHO_MAXIMO,
  OBRA_NOME_TAMANHO_MAXIMO,
  type ObraResponse,
  PerfilUsuario,
  type UsuarioResponse,
} from '@sistema/shared';
import { AuthService } from '../../core/auth/auth.service';
import { mensagemDoErro } from '../../core/http/erro-api';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { CampoTextoComponent } from '../../shared/components/campo-texto/campo-texto.component';
import { EstadoConteudoComponent } from '../../shared/components/estado-conteudo/estado-conteudo.component';
import { UsuariosService } from '../usuarios/usuarios.service';
import { ObrasService } from './obras.service';

/** Tamanho de pagina suficiente para listar os encarregados cadastrados. */
const LIMITE_ENCARREGADOS = 100;

/**
 * Cadastro e edicao de obra/setor, com vinculo de encarregados
 * (T-020 / RF-008, RF-003).
 *
 * O bloco de encarregados aparece somente na edicao e somente para o ADMIN:
 * vincular encarregado define o que ele passa a enxergar (RN-05), e a API
 * recusa qualquer outro perfil nesses endpoints.
 */
@Component({
  selector: 'app-pagina-obra-form',
  imports: [
    CampoTextoComponent,
    EstadoConteudoComponent,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-obra-form.component.scss',
  templateUrl: './pagina-obra-form.component.html',
})
export class PaginaObraFormComponent {
  /** Vem do parametro de rota; ausente na criacao. */
  readonly id = input<string | undefined>(undefined);

  private readonly servico = inject(ObrasService);
  private readonly usuarios = inject(UsuariosService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificacao = inject(NotificacaoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly tamanhoMaximoNome = OBRA_NOME_TAMANHO_MAXIMO;
  readonly tamanhoMaximoEndereco = OBRA_ENDERECO_TAMANHO_MAXIMO;

  readonly carregando = signal(false);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly obra = signal<ObraResponse | null>(null);

  readonly edicao = computed(() => this.id() !== undefined);
  readonly titulo = computed(() => (this.edicao() ? 'Editar obra' : 'Nova obra'));

  /** RF-003 e requisito de acesso: somente o ADMIN altera o vinculo. */
  readonly podeVincular = computed(() => this.auth.temAlgumPerfil([PerfilUsuario.ADMIN]));
  readonly mostrarEncarregados = computed(() => this.edicao() && this.podeVincular());

  readonly encarregadosDisponiveis = signal<readonly UsuarioResponse[]>([]);
  readonly vinculados = signal<readonly EncarregadoObraResponse[]>([]);
  readonly carregandoEncarregados = signal(false);
  readonly salvandoEncarregados = signal(false);

  readonly form = this.formBuilder.group({
    nome: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(OBRA_NOME_TAMANHO_MAXIMO),
    ]),
    endereco: this.formBuilder.control<string | null>(null, [
      Validators.maxLength(OBRA_ENDERECO_TAMANHO_MAXIMO),
    ]),
    ativa: this.formBuilder.control<boolean>(true, { nonNullable: true }),
  });

  readonly formEncarregados = this.formBuilder.group({
    usuariosIds: this.formBuilder.control<string[]>([], { nonNullable: true }),
  });

  constructor() {
    effect(() => {
      const id = this.id();
      if (id === undefined) {
        this.prepararCriacao();
        return;
      }
      this.carregar(id);
      if (this.podeVincular()) {
        this.carregarEncarregados(id);
      }
    });
  }

  private prepararCriacao(): void {
    this.obra.set(null);
    this.form.reset({ ativa: true });
    this.vinculados.set([]);
    this.encarregadosDisponiveis.set([]);
  }

  private carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.servico
      .buscar(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (obra) => {
          this.obra.set(obra);
          this.form.patchValue({
            nome: obra.nome,
            endereco: obra.endereco,
            ativa: obra.ativa,
          });
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(this.mensagem(erro, 'Nao foi possivel carregar a obra.'));
          this.carregando.set(false);
        },
      });
  }

  /** Lista de encarregados ativos e o vinculo atual da obra (RF-003). */
  private carregarEncarregados(id: string): void {
    this.carregandoEncarregados.set(true);

    this.usuarios
      .listar({
        perfil: PerfilUsuario.ENCARREGADO,
        ativo: true,
        pagina: 1,
        tamanho: LIMITE_ENCARREGADOS,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => this.encarregadosDisponiveis.set(resposta.itens),
        error: () => this.notificacao.erro('Nao foi possivel carregar a lista de encarregados.'),
      });

    this.servico
      .listarEncarregados(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (itens) => {
          this.vinculados.set(itens);
          this.formEncarregados.setValue({ usuariosIds: itens.map((item) => item.usuarioId) });
          this.carregandoEncarregados.set(false);
        },
        error: (erro: unknown) => {
          this.carregandoEncarregados.set(false);
          this.notificacao.erro(
            this.mensagem(erro, 'Nao foi possivel carregar os encarregados da obra.'),
          );
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
    const { nome, endereco } = this.form.getRawValue();
    if (nome === null) {
      return;
    }

    this.enviando.set(true);

    this.servico
      .criar({ nome, endereco: endereco ?? null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (criada) => {
          this.enviando.set(false);
          this.notificacao.sucesso('Obra criada.');
          // Vai para a edicao: e la que o admin vincula os encarregados.
          void this.router.navigate(['/obras', criada.id]);
        },
        error: (erro: unknown) => this.tratarFalhaDeEnvio(erro),
      });
  }

  private atualizar(id: string): void {
    const atual = this.obra();
    const { nome, endereco, ativa } = this.form.getRawValue();
    if (atual === null || nome === null) {
      return;
    }

    const enderecoNovo = endereco === null || endereco.trim().length === 0 ? null : endereco;

    // Envia somente o que mudou.
    const alteracoes: AtualizarObraRequest = {
      ...(nome === atual.nome ? {} : { nome }),
      ...(enderecoNovo === atual.endereco ? {} : { endereco: enderecoNovo }),
      ...(ativa === atual.ativa ? {} : { ativa }),
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
        next: (atualizada) => {
          this.enviando.set(false);
          this.obra.set(atualizada);
          this.notificacao.sucesso('Obra atualizada.');
          void this.router.navigate(['/obras']);
        },
        error: (erro: unknown) => this.tratarFalhaDeEnvio(erro),
      });
  }

  /** RF-003: substitui a lista de encarregados da obra. */
  salvarEncarregados(): void {
    const id = this.id();
    if (id === undefined || this.salvandoEncarregados()) {
      return;
    }

    this.salvandoEncarregados.set(true);

    this.servico
      .definirEncarregados(id, { usuariosIds: this.formEncarregados.getRawValue().usuariosIds })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (itens) => {
          this.salvandoEncarregados.set(false);
          this.vinculados.set(itens);
          this.notificacao.sucesso('Encarregados da obra atualizados.');
        },
        error: (erro: unknown) => {
          this.salvandoEncarregados.set(false);
          this.notificacao.erro(
            this.mensagem(erro, 'Nao foi possivel salvar os encarregados da obra.'),
          );
        },
      });
  }

  cancelar(): void {
    void this.router.navigate(['/obras']);
  }

  private tratarFalhaDeEnvio(erro: unknown): void {
    this.enviando.set(false);
    this.notificacao.erro(this.mensagem(erro, 'Nao foi possivel salvar a obra.'));
  }

  private mensagem(erro: unknown, padrao: string): string {
    return erro instanceof HttpErrorResponse ? mensagemDoErro(erro) : padrao;
  }
}
