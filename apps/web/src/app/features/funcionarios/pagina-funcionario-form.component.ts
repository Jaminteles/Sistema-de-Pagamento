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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import {
  AGENCIA_TAMANHO_MAXIMO,
  type AtualizarFuncionarioRequest,
  BANCO_TAMANHO_MAXIMO,
  CHAVE_PIX_TAMANHO_MAXIMO,
  CONTA_TAMANHO_MAXIMO,
  type DadosPagamentoResponse,
  FUNCIONARIO_CARGO_TAMANHO_MAXIMO,
  FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO,
  FUNCIONARIO_NOME_TAMANHO_MAXIMO,
  type FuncionarioResponse,
  type JornadaResponse,
  type ObraResponse,
  SITUACAO_FUNCIONARIO_LABEL,
  SITUACOES_FUNCIONARIO,
  SituacaoFuncionario,
  TIPO_CHAVE_PIX_LABEL,
  TIPOS_CHAVE_PIX,
  type TipoChavePix,
  type VinculoFuncionarioResponse,
} from '@sistema/shared';
import { mensagemDoErro } from '../../core/http/erro-api';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { CampoTextoComponent } from '../../shared/components/campo-texto/campo-texto.component';
import { EstadoConteudoComponent } from '../../shared/components/estado-conteudo/estado-conteudo.component';
import { chavePixValidator, cpfValidator } from '../../shared/forms/validadores';
import { JornadasService } from '../jornadas/jornadas.service';
import { ObrasService } from '../obras/obras.service';
import { FuncionariosService } from './funcionarios.service';

/** Obras e jornadas cabem numa pagina so neste porte de empresa. */
const LIMITE_LISTAS = 100;

/**
 * Cadastro e edicao de funcionario, em abas (T-029 / RF-006, RF-007, RF-010).
 *
 *   - Dados: identificacao e situacao. O CPF so entra na criacao - depois ele
 *     identifica a pessoa no historico de ponto e no casamento dos liquidos.
 *   - Pagamento e Vinculos: so na edicao, porque dependem do funcionario ja
 *     existir.
 *
 * Nenhuma regra de negocio aqui: coerencia de situacao (RN-12), sobreposicao de
 * vigencia e formato da chave Pix sao decididos pela API. As validacoes locais
 * apenas evitam uma ida ao servidor para avisar o obvio.
 */
@Component({
  selector: 'app-pagina-funcionario-form',
  imports: [
    CampoTextoComponent,
    EstadoConteudoComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-funcionario-form.component.scss',
  templateUrl: './pagina-funcionario-form.component.html',
})
export class PaginaFuncionarioFormComponent {
  /** Vem do parametro de rota; ausente na criacao. */
  readonly id = input<string | undefined>(undefined);

  private readonly servico = inject(FuncionariosService);
  private readonly obrasServico = inject(ObrasService);
  private readonly jornadasServico = inject(JornadasService);
  private readonly router = inject(Router);
  private readonly notificacao = inject(NotificacaoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly tamanhoMaximoNome = FUNCIONARIO_NOME_TAMANHO_MAXIMO;
  readonly tamanhoMaximoMatricula = FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO;
  readonly tamanhoMaximoCargo = FUNCIONARIO_CARGO_TAMANHO_MAXIMO;
  readonly tamanhoMaximoChave = CHAVE_PIX_TAMANHO_MAXIMO;
  readonly tamanhoMaximoBanco = BANCO_TAMANHO_MAXIMO;
  readonly tamanhoMaximoAgencia = AGENCIA_TAMANHO_MAXIMO;
  readonly tamanhoMaximoConta = CONTA_TAMANHO_MAXIMO;

  readonly situacoes = SITUACOES_FUNCIONARIO;
  readonly rotuloSituacao = SITUACAO_FUNCIONARIO_LABEL;
  readonly tiposChave = TIPOS_CHAVE_PIX;
  readonly rotuloTipoChave = TIPO_CHAVE_PIX_LABEL;

  readonly carregando = signal(false);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly funcionario = signal<FuncionarioResponse | null>(null);

  readonly edicao = computed(() => this.id() !== undefined);
  readonly titulo = computed(() => (this.edicao() ? 'Editar funcionario' : 'Novo funcionario'));

  readonly pagamento = signal<DadosPagamentoResponse | null>(null);
  readonly carregandoPagamento = signal(false);
  readonly salvandoPagamento = signal(false);

  readonly vinculos = signal<readonly VinculoFuncionarioResponse[]>([]);
  readonly carregandoVinculos = signal(false);
  readonly salvandoVinculo = signal(false);
  readonly obras = signal<readonly ObraResponse[]>([]);
  readonly jornadas = signal<readonly JornadaResponse[]>([]);

  readonly vinculoAberto = computed(
    () => this.vinculos().find((item) => item.fimVigencia === null) ?? null,
  );

  readonly form = this.formBuilder.group({
    nome: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(FUNCIONARIO_NOME_TAMANHO_MAXIMO),
    ]),
    cpf: this.formBuilder.control<string | null>(null, [Validators.required, cpfValidator]),
    matricula: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.maxLength(FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO),
    ]),
    cargo: this.formBuilder.control<string | null>(null, [
      Validators.maxLength(FUNCIONARIO_CARGO_TAMANHO_MAXIMO),
    ]),
    admissao: this.formBuilder.control<string | null>(null, [Validators.required]),
    situacao: this.formBuilder.control<SituacaoFuncionario>(SituacaoFuncionario.ATIVO, {
      nonNullable: true,
    }),
    desligamento: this.formBuilder.control<string | null>(null),
  });

  /**
   * O control do tipo fica em campo proprio porque o validador da chave precisa
   * dele: referenciar `formPagamento` dentro do proprio inicializador seria
   * circular.
   */
  private readonly controleTipoChave = this.formBuilder.control<TipoChavePix | null>(null);

  readonly formPagamento = this.formBuilder.group({
    tipoChave: this.controleTipoChave,
    chavePix: this.formBuilder.control<string | null>(null, [
      Validators.maxLength(CHAVE_PIX_TAMANHO_MAXIMO),
      chavePixValidator(() => this.controleTipoChave.value),
    ]),
    banco: this.formBuilder.control<string | null>(null, [
      Validators.maxLength(BANCO_TAMANHO_MAXIMO),
    ]),
    agencia: this.formBuilder.control<string | null>(null, [
      Validators.maxLength(AGENCIA_TAMANHO_MAXIMO),
    ]),
    conta: this.formBuilder.control<string | null>(null, [
      Validators.maxLength(CONTA_TAMANHO_MAXIMO),
    ]),
  });

  readonly formVinculo = this.formBuilder.group({
    obraId: this.formBuilder.control<string | null>(null, [Validators.required]),
    jornadaId: this.formBuilder.control<string | null>(null, [Validators.required]),
    inicioVigencia: this.formBuilder.control<string | null>(null, [Validators.required]),
    fimVigencia: this.formBuilder.control<string | null>(null),
  });

  constructor() {
    // Trocar o tipo muda o formato aceito da chave: revalida o campo na hora.
    this.controleTipoChave.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formPagamento.controls.chavePix.updateValueAndValidity());

    effect(() => {
      const id = this.id();
      if (id === undefined) {
        this.prepararCriacao();
        return;
      }
      this.carregar(id);
      this.carregarPagamento(id);
      this.carregarVinculos(id);
    });
  }

  private prepararCriacao(): void {
    this.funcionario.set(null);
    this.pagamento.set(null);
    this.vinculos.set([]);
    this.form.reset({ situacao: SituacaoFuncionario.ATIVO });
    this.form.controls.cpf.enable();
  }

  private carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.servico
      .buscar(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (funcionario) => {
          this.funcionario.set(funcionario);
          this.form.patchValue({
            nome: funcionario.nome,
            cpf: funcionario.cpf,
            matricula: funcionario.matricula,
            cargo: funcionario.cargo,
            admissao: funcionario.admissao,
            situacao: funcionario.situacao,
            desligamento: funcionario.desligamento,
          });
          // O CPF nao e alteravel depois do cadastro.
          this.form.controls.cpf.disable();
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(this.mensagem(erro, 'Nao foi possivel carregar o funcionario.'));
          this.carregando.set(false);
        },
      });
  }

  /** RF-007. A API recusa o perfil sem permissao; a aba fica vazia nesse caso. */
  private carregarPagamento(id: string): void {
    this.carregandoPagamento.set(true);

    this.servico
      .buscarDadosPagamento(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (dados) => {
          this.pagamento.set(dados);
          this.formPagamento.patchValue({
            tipoChave: dados.tipoChave,
            chavePix: dados.chavePix,
            banco: dados.banco,
            agencia: dados.agencia,
            conta: dados.conta,
          });
          this.carregandoPagamento.set(false);
        },
        error: () => {
          this.pagamento.set(null);
          this.carregandoPagamento.set(false);
        },
      });
  }

  private carregarVinculos(id: string): void {
    this.carregandoVinculos.set(true);

    this.servico
      .listarVinculos(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (itens) => {
          this.vinculos.set(itens);
          this.carregandoVinculos.set(false);
        },
        error: (erro: unknown) => {
          this.carregandoVinculos.set(false);
          this.notificacao.erro(this.mensagem(erro, 'Nao foi possivel carregar os vinculos.'));
        },
      });

    this.obrasServico
      .listar({ ativa: true, pagina: 1, tamanho: LIMITE_LISTAS })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => this.obras.set(resposta.itens),
        error: () => this.obras.set([]),
      });

    this.jornadasServico
      .listar({ ativa: true, pagina: 1, tamanho: LIMITE_LISTAS })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => this.jornadas.set(resposta.itens),
        error: () => this.jornadas.set([]),
      });
  }

  // -------------------------------------------------------------------------
  // Aba Dados
  // -------------------------------------------------------------------------

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
    const { nome, cpf, matricula, cargo, admissao } = this.form.getRawValue();
    if (nome === null || cpf === null || matricula === null || admissao === null) {
      return;
    }

    this.enviando.set(true);

    this.servico
      .criar({ nome, cpf, matricula, cargo: cargo ?? null, admissao })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (criado) => {
          this.enviando.set(false);
          this.notificacao.sucesso('Funcionario cadastrado.');
          // Vai para a edicao: e la que entram pagamento e vinculos.
          void this.router.navigate(['/funcionarios', criado.id]);
        },
        error: (erro: unknown) => this.falhaAoSalvar(erro, 'Nao foi possivel salvar o funcionario.'),
      });
  }

  private atualizar(id: string): void {
    const atual = this.funcionario();
    const { nome, matricula, cargo, admissao, situacao, desligamento } = this.form.getRawValue();
    if (atual === null || nome === null || matricula === null || admissao === null) {
      return;
    }

    const cargoNovo = cargo === null || cargo.trim().length === 0 ? null : cargo;

    // Envia somente o que mudou.
    const alteracoes: AtualizarFuncionarioRequest = {
      ...(nome === atual.nome ? {} : { nome }),
      ...(matricula === atual.matricula ? {} : { matricula }),
      ...(cargoNovo === atual.cargo ? {} : { cargo: cargoNovo }),
      ...(admissao === atual.admissao ? {} : { admissao }),
      ...(situacao === atual.situacao ? {} : { situacao }),
      ...((desligamento ?? null) === atual.desligamento
        ? {}
        : { desligamento: desligamento ?? null }),
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
          this.funcionario.set(atualizado);
          this.notificacao.sucesso('Funcionario atualizado.');
        },
        error: (erro: unknown) => this.falhaAoSalvar(erro, 'Nao foi possivel salvar o funcionario.'),
      });
  }

  // -------------------------------------------------------------------------
  // Aba Pagamento (RF-007)
  // -------------------------------------------------------------------------

  salvarPagamento(): void {
    const id = this.id();
    if (id === undefined || this.salvandoPagamento()) {
      return;
    }

    this.formPagamento.markAllAsTouched();
    if (this.formPagamento.invalid) {
      return;
    }

    const { tipoChave, chavePix, banco, agencia, conta } = this.formPagamento.getRawValue();
    this.salvandoPagamento.set(true);

    this.servico
      .definirDadosPagamento(id, {
        tipoChave: tipoChave ?? null,
        chavePix: chavePix ?? null,
        banco: banco ?? null,
        agencia: agencia ?? null,
        conta: conta ?? null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (dados) => {
          this.salvandoPagamento.set(false);
          this.pagamento.set(dados);
          this.notificacao.sucesso('Dados de pagamento atualizados.');
        },
        error: (erro: unknown) => {
          this.salvandoPagamento.set(false);
          this.notificacao.erro(
            this.mensagem(erro, 'Nao foi possivel salvar os dados de pagamento.'),
          );
        },
      });
  }

  // -------------------------------------------------------------------------
  // Aba Vinculos (RF-010)
  // -------------------------------------------------------------------------

  adicionarVinculo(): void {
    const id = this.id();
    if (id === undefined || this.salvandoVinculo()) {
      return;
    }

    this.formVinculo.markAllAsTouched();
    if (this.formVinculo.invalid) {
      return;
    }

    const { obraId, jornadaId, inicioVigencia, fimVigencia } = this.formVinculo.getRawValue();
    if (obraId === null || jornadaId === null || inicioVigencia === null) {
      return;
    }

    this.salvandoVinculo.set(true);

    this.servico
      .criarVinculo(id, { obraId, jornadaId, inicioVigencia, fimVigencia: fimVigencia ?? null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.salvandoVinculo.set(false);
          this.formVinculo.reset();
          this.notificacao.sucesso('Vinculo criado.');
          this.recarregarVinculos(id);
        },
        error: (erro: unknown) => {
          this.salvandoVinculo.set(false);
          this.notificacao.erro(this.mensagem(erro, 'Nao foi possivel criar o vinculo.'));
        },
      });
  }

  encerrarVinculo(vinculo: VinculoFuncionarioResponse, fim: string): void {
    const id = this.id();
    if (id === undefined || fim.length === 0 || this.salvandoVinculo()) {
      return;
    }

    this.salvandoVinculo.set(true);

    this.servico
      .atualizarVinculo(id, vinculo.id, { fimVigencia: fim })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.salvandoVinculo.set(false);
          this.notificacao.sucesso('Vinculo encerrado.');
          this.recarregarVinculos(id);
        },
        error: (erro: unknown) => {
          this.salvandoVinculo.set(false);
          this.notificacao.erro(this.mensagem(erro, 'Nao foi possivel encerrar o vinculo.'));
        },
      });
  }

  private recarregarVinculos(id: string): void {
    this.servico
      .listarVinculos(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (itens) => this.vinculos.set(itens),
        error: () => this.notificacao.erro('Nao foi possivel atualizar a lista de vinculos.'),
      });
  }

  cancelar(): void {
    void this.router.navigate(['/funcionarios']);
  }

  private falhaAoSalvar(erro: unknown, padrao: string): void {
    this.enviando.set(false);
    this.notificacao.erro(this.mensagem(erro, padrao));
  }

  private mensagem(erro: unknown, padrao: string): string {
    return erro instanceof HttpErrorResponse ? mensagemDoErro(erro) : padrao;
  }
}
