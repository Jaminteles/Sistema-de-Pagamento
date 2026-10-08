import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import {
  ABRANGENCIA_FERIADO_LABEL,
  ABRANGENCIAS_FERIADO,
  AbrangenciaFeriado,
  dataIsoValida,
  FERIADO_ANO_MAXIMO,
  FERIADO_ANO_MINIMO,
  FERIADO_DESCRICAO_TAMANHO_MAXIMO,
  FERIADO_MUNICIPIO_TAMANHO_MAXIMO,
  type FeriadoResponse,
} from '@sistema/shared';
import { mensagemDoErro } from '../../core/http/erro-api';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { CampoTextoComponent } from '../../shared/components/campo-texto/campo-texto.component';
import { ConfirmacaoService } from '../../shared/components/modal-confirmacao/confirmacao.service';
import { calendarioDoAno, CABECALHO_SEMANA, type MesCalendario } from './calendario';
import { FeriadosService } from './feriados.service';

/**
 * Calendario de feriados (T-022 / RF-011).
 *
 * Um ano por vez: o ano tem poucas dezenas de feriados, entao a API devolve
 * tudo de uma vez e a navegacao entre meses nao gera novas requisicoes.
 *
 * Clicar num dia abre o cadastro daquela data; clicar num dia que ja tem
 * feriado abre a edicao. A carga dos feriados nacionais e idempotente na API.
 */
@Component({
  selector: 'app-pagina-feriados',
  imports: [
    CampoTextoComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-feriados.component.scss',
  templateUrl: './pagina-feriados.component.html',
})
export class PaginaFeriadosComponent {
  private readonly servico = inject(FeriadosService);
  private readonly notificacao = inject(NotificacaoService);
  private readonly confirmacao = inject(ConfirmacaoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly abrangencias = ABRANGENCIAS_FERIADO;
  readonly rotuloAbrangencia = ABRANGENCIA_FERIADO_LABEL;
  readonly cabecalhoSemana = CABECALHO_SEMANA;
  readonly tamanhoMaximoDescricao = FERIADO_DESCRICAO_TAMANHO_MAXIMO;
  readonly tamanhoMaximoMunicipio = FERIADO_MUNICIPIO_TAMANHO_MAXIMO;

  readonly ano = signal(new Date().getFullYear());
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly enviando = signal(false);
  readonly carregandoNacionais = signal(false);
  readonly feriados = signal<readonly FeriadoResponse[]>([]);
  readonly emEdicao = signal<FeriadoResponse | null>(null);
  readonly formAberto = signal(false);

  readonly meses = computed<MesCalendario[]>(() => calendarioDoAno(this.ano()));

  /** Feriados por data, para o calendario achar o dia em tempo constante. */
  private readonly porData = computed(() => {
    const mapa = new Map<string, FeriadoResponse>();
    for (const feriado of this.feriados()) {
      mapa.set(feriado.data, feriado);
    }
    return mapa;
  });

  readonly tituloForm = computed(() => (this.emEdicao() ? 'Editar feriado' : 'Novo feriado'));

  readonly form = this.formBuilder.group({
    data: this.formBuilder.control<string | null>(null, [Validators.required]),
    descricao: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(FERIADO_DESCRICAO_TAMANHO_MAXIMO),
    ]),
    abrangencia: this.formBuilder.control<AbrangenciaFeriado | null>(AbrangenciaFeriado.NACIONAL, [
      Validators.required,
    ]),
    uf: this.formBuilder.control<string | null>(null, [
      Validators.minLength(2),
      Validators.maxLength(2),
    ]),
    municipio: this.formBuilder.control<string | null>(null, [
      Validators.maxLength(FERIADO_MUNICIPIO_TAMANHO_MAXIMO),
    ]),
  });

  private readonly abrangenciaAtual = toSignal(this.form.controls.abrangencia.valueChanges, {
    initialValue: this.form.controls.abrangencia.value,
  });

  /** Espelha as regras de coerencia da API; a validacao de verdade e no back-end. */
  readonly exigeUf = computed(() => this.abrangenciaAtual() !== AbrangenciaFeriado.NACIONAL);
  readonly exigeMunicipio = computed(
    () => this.abrangenciaAtual() === AbrangenciaFeriado.MUNICIPAL,
  );

  constructor() {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.servico
      .listar({ ano: this.ano() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (itens) => {
          this.feriados.set(itens);
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(this.mensagem(erro, 'Nao foi possivel carregar o calendario.'));
          this.carregando.set(false);
        },
      });
  }

  mudarAno(passo: number): void {
    const novo = this.ano() + passo;
    if (novo < FERIADO_ANO_MINIMO || novo > FERIADO_ANO_MAXIMO) {
      return;
    }
    this.ano.set(novo);
    this.fechar();
    this.carregar();
  }

  feriadoDoDia(dataIso: string): FeriadoResponse | undefined {
    return dataIso ? this.porData().get(dataIso) : undefined;
  }

  descricaoDoDia(dataIso: string): string {
    return this.feriadoDoDia(dataIso)?.descricao ?? '';
  }

  /** Clique no dia: abre a edicao do feriado existente ou o cadastro da data. */
  selecionarDia(dataIso: string): void {
    if (!dataIso) {
      return;
    }

    const existente = this.feriadoDoDia(dataIso);
    if (existente) {
      this.abrirEdicao(existente);
      return;
    }

    this.emEdicao.set(null);
    this.form.reset({ data: dataIso, abrangencia: AbrangenciaFeriado.NACIONAL });
    this.formAberto.set(true);
  }

  abrirEdicao(feriado: FeriadoResponse): void {
    this.emEdicao.set(feriado);
    this.form.reset({
      data: feriado.data,
      descricao: feriado.descricao,
      abrangencia: feriado.abrangencia,
      uf: feriado.uf,
      municipio: feriado.municipio,
    });
    this.formAberto.set(true);
  }

  fechar(): void {
    this.formAberto.set(false);
    this.emEdicao.set(null);
  }

  salvar(): void {
    if (this.enviando()) {
      return;
    }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    const { data, descricao, abrangencia, uf, municipio } = this.form.getRawValue();

    if (data === null || descricao === null || abrangencia === null) {
      return;
    }

    if (!dataIsoValida(data)) {
      this.notificacao.erro('Informe uma data valida no formato AAAA-MM-DD.');
      return;
    }

    const nacional = abrangencia === AbrangenciaFeriado.NACIONAL;
    const corpo = {
      data,
      descricao,
      abrangencia,
      uf: nacional ? null : (uf?.trim().toUpperCase() ?? null),
      municipio: abrangencia === AbrangenciaFeriado.MUNICIPAL ? (municipio?.trim() ?? null) : null,
    };

    this.enviando.set(true);

    const atual = this.emEdicao();
    const requisicao =
      atual === null ? this.servico.criar(corpo) : this.servico.atualizar(atual.id, corpo);

    requisicao.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.enviando.set(false);
        this.notificacao.sucesso(atual === null ? 'Feriado cadastrado.' : 'Feriado atualizado.');
        this.fechar();
        this.carregar();
      },
      error: (erro: unknown) => {
        this.enviando.set(false);
        this.notificacao.erro(this.mensagem(erro, 'Nao foi possivel salvar o feriado.'));
      },
    });
  }

  async remover(): Promise<void> {
    const atual = this.emEdicao();
    if (atual === null || this.enviando()) {
      return;
    }

    const confirmado = await this.confirmacao.confirmar({
      titulo: 'Remover feriado',
      mensagem: `Remover "${atual.descricao}" de ${atual.data}? O dia volta a contar como dia comum na apuracao.`,
      textoConfirmar: 'Remover',
      perigoso: true,
    });

    if (!confirmado) {
      return;
    }

    this.enviando.set(true);

    this.servico
      .remover(atual.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.notificacao.sucesso('Feriado removido.');
          this.fechar();
          this.carregar();
        },
        error: (erro: unknown) => {
          this.enviando.set(false);
          this.notificacao.erro(this.mensagem(erro, 'Nao foi possivel remover o feriado.'));
        },
      });
  }

  /** Carga inicial dos feriados nacionais do ano exibido (RF-011). */
  carregarNacionais(): void {
    if (this.carregandoNacionais()) {
      return;
    }

    this.carregandoNacionais.set(true);

    this.servico
      .carregarNacionais({ ano: this.ano() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.carregandoNacionais.set(false);
          this.notificacao.sucesso(
            `${resposta.criados} feriado(s) nacional(is) incluido(s); ${resposta.jaExistentes} ja estavam no calendario.`,
          );
          this.carregar();
        },
        error: (erro: unknown) => {
          this.carregandoNacionais.set(false);
          this.notificacao.erro(
            this.mensagem(erro, 'Nao foi possivel carregar os feriados nacionais.'),
          );
        },
      });
  }

  private mensagem(erro: unknown, padrao: string): string {
    return erro instanceof HttpErrorResponse ? mensagemDoErro(erro) : padrao;
  }
}
