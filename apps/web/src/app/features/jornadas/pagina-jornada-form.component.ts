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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import {
  type AtualizarJornadaRequest,
  DIA_SEMANA_LABEL,
  DIAS_SEMANA,
  duracaoEmMinutos,
  horaParaMinutos,
  JORNADA_CARGA_SEMANAL_MAXIMA_MINUTOS,
  JORNADA_INTERVALO_MAXIMO_MINUTOS,
  JORNADA_NOME_TAMANHO_MAXIMO,
  JORNADA_TOLERANCIA_MAXIMA_MINUTOS,
  JORNADA_TOLERANCIA_PADRAO_MINUTOS,
  type JornadaResponse,
  minutosParaDuracao,
  minutosParaHora,
} from '@sistema/shared';
import { mensagemDoErro } from '../../core/http/erro-api';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { CampoTextoComponent } from '../../shared/components/campo-texto/campo-texto.component';
import { EstadoConteudoComponent } from '../../shared/components/estado-conteudo/estado-conteudo.component';
import { JornadasService } from './jornadas.service';

/** Um dia na pre-visualizacao da semana. */
export interface DiaPrevisto {
  dia: number;
  rotulo: string;
  trabalha: boolean;
  horario: string;
  duracao: string;
}

/**
 * Cadastro e edicao de jornada, com pre-visualizacao da semana
 * (T-021 / RF-009).
 *
 * Horas e minutos sao sempre inteiros: os campos de horario viram minutos desde
 * a meia-noite antes de ir para a API, e a carga semanal e informada em horas e
 * minutos separados - nunca em decimal.
 *
 * A pre-visualizacao so repete o que foi digitado (horario, intervalo e duracao
 * prevista do dia). Tolerancia, extras, noturno e atraso sao do motor de
 * apuracao, no back-end.
 */
@Component({
  selector: 'app-pagina-jornada-form',
  imports: [
    CampoTextoComponent,
    EstadoConteudoComponent,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-jornada-form.component.scss',
  templateUrl: './pagina-jornada-form.component.html',
})
export class PaginaJornadaFormComponent {
  /** Vem do parametro de rota; ausente na criacao. */
  readonly id = input<string | undefined>(undefined);

  private readonly servico = inject(JornadasService);
  private readonly router = inject(Router);
  private readonly notificacao = inject(NotificacaoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly dias = DIAS_SEMANA;
  readonly rotuloDia = DIA_SEMANA_LABEL;
  readonly tamanhoMaximoNome = JORNADA_NOME_TAMANHO_MAXIMO;
  readonly toleranciaPadrao = JORNADA_TOLERANCIA_PADRAO_MINUTOS;

  readonly carregando = signal(false);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly jornada = signal<JornadaResponse | null>(null);

  readonly edicao = computed(() => this.id() !== undefined);
  readonly titulo = computed(() => (this.edicao() ? 'Editar jornada' : 'Nova jornada'));

  readonly form = this.formBuilder.group({
    nome: this.formBuilder.control<string | null>(null, [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(JORNADA_NOME_TAMANHO_MAXIMO),
    ]),
    entrada: this.formBuilder.control<string | null>('07:00', [Validators.required]),
    saida: this.formBuilder.control<string | null>('17:00', [Validators.required]),
    intervaloMinutos: this.formBuilder.control<number | null>(60, [
      Validators.required,
      Validators.min(0),
      Validators.max(JORNADA_INTERVALO_MAXIMO_MINUTOS),
    ]),
    cargaHoras: this.formBuilder.control<number | null>(44, [
      Validators.required,
      Validators.min(0),
      Validators.max(Math.floor(JORNADA_CARGA_SEMANAL_MAXIMA_MINUTOS / 60)),
    ]),
    cargaMinutos: this.formBuilder.control<number | null>(0, [
      Validators.required,
      Validators.min(0),
      Validators.max(59),
    ]),
    toleranciaMinutos: this.formBuilder.control<number | null>(JORNADA_TOLERANCIA_PADRAO_MINUTOS, [
      Validators.required,
      Validators.min(0),
      Validators.max(JORNADA_TOLERANCIA_MAXIMA_MINUTOS),
    ]),
    diasSemana: this.formBuilder.control<number[]>([1, 2, 3, 4, 5], { nonNullable: true }),
    ativa: this.formBuilder.control<boolean>(true, { nonNullable: true }),
  });

  /** Valores do formulario como signal, para a pre-visualizacao reagir. */
  private readonly valores = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly semana = computed<DiaPrevisto[]>(() => {
    // Lido para criar a dependencia: o calculo abaixo usa getRawValue().
    this.valores();
    const { entrada, saida, intervaloMinutos, diasSemana } = this.form.getRawValue();

    const entradaMinutos = entrada === null ? null : horaParaMinutos(entrada);
    const saidaMinutos = saida === null ? null : horaParaMinutos(saida);
    const intervalo = intervaloMinutos ?? 0;

    return DIAS_SEMANA.map((dia) => {
      const trabalha = diasSemana.includes(dia);

      if (!trabalha || entradaMinutos === null || saidaMinutos === null) {
        return {
          dia,
          rotulo: DIA_SEMANA_LABEL[dia] ?? String(dia),
          trabalha,
          horario: trabalha ? '-' : 'Folga',
          duracao: '',
        };
      }

      const bruta = duracaoEmMinutos(entradaMinutos, saidaMinutos);
      const liquida = Math.max(0, bruta - intervalo);

      return {
        dia,
        rotulo: DIA_SEMANA_LABEL[dia] ?? String(dia),
        trabalha,
        horario: `${minutosParaHora(entradaMinutos)} - ${minutosParaHora(saidaMinutos)}`,
        duracao: minutosParaDuracao(liquida),
      };
    });
  });

  /** Virada de meia-noite: a saida cai no dia seguinte. */
  readonly viraDia = computed(() => {
    this.valores();
    const { entrada, saida } = this.form.getRawValue();
    const entradaMinutos = entrada === null ? null : horaParaMinutos(entrada);
    const saidaMinutos = saida === null ? null : horaParaMinutos(saida);
    if (entradaMinutos === null || saidaMinutos === null) {
      return false;
    }
    return saidaMinutos <= entradaMinutos;
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
    this.jornada.set(null);
    this.form.reset({
      entrada: '07:00',
      saida: '17:00',
      intervaloMinutos: 60,
      cargaHoras: 44,
      cargaMinutos: 0,
      toleranciaMinutos: JORNADA_TOLERANCIA_PADRAO_MINUTOS,
      diasSemana: [1, 2, 3, 4, 5],
      ativa: true,
    });
  }

  private carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.servico
      .buscar(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (jornada) => {
          this.jornada.set(jornada);
          this.form.patchValue({
            nome: jornada.nome,
            entrada: minutosParaHora(jornada.entradaMinutos),
            saida: minutosParaHora(jornada.saidaMinutos),
            intervaloMinutos: jornada.intervaloMinutos,
            cargaHoras: Math.floor(jornada.cargaSemanalMinutos / 60),
            cargaMinutos: jornada.cargaSemanalMinutos % 60,
            toleranciaMinutos: jornada.toleranciaMinutos,
            diasSemana: [...jornada.diasSemana],
            ativa: jornada.ativa,
          });
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(this.mensagem(erro, 'Nao foi possivel carregar a jornada.'));
          this.carregando.set(false);
        },
      });
  }

  diaMarcado(dia: number): boolean {
    return this.form.getRawValue().diasSemana.includes(dia);
  }

  alternarDia(dia: number, marcado: boolean): void {
    const atuais = this.form.getRawValue().diasSemana;
    const novos = marcado
      ? [...new Set([...atuais, dia])].sort((a, b) => a - b)
      : atuais.filter((item) => item !== dia);
    this.form.controls.diasSemana.setValue(novos);
    this.form.controls.diasSemana.markAsTouched();
  }

  salvar(): void {
    if (this.enviando()) {
      return;
    }

    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }

    const dados = this.montarDados();
    if (dados === null) {
      return;
    }

    const id = this.id();
    if (id === undefined) {
      this.criar(dados);
      return;
    }
    this.atualizar(id, dados);
  }

  /**
   * Converte o formulario em minutos inteiros. Devolve null quando algum
   * horario esta fora do formato - a API e, de todo modo, quem valida de fato.
   */
  private montarDados(): {
    nome: string;
    entradaMinutos: number;
    saidaMinutos: number;
    intervaloMinutos: number;
    cargaSemanalMinutos: number;
    toleranciaMinutos: number;
    diasSemana: number[];
    ativa: boolean;
  } | null {
    const bruto = this.form.getRawValue();

    const entradaMinutos = bruto.entrada === null ? null : horaParaMinutos(bruto.entrada);
    const saidaMinutos = bruto.saida === null ? null : horaParaMinutos(bruto.saida);

    if (
      bruto.nome === null ||
      entradaMinutos === null ||
      saidaMinutos === null ||
      bruto.intervaloMinutos === null ||
      bruto.cargaHoras === null ||
      bruto.cargaMinutos === null ||
      bruto.toleranciaMinutos === null
    ) {
      this.notificacao.erro('Revise os horarios informados.');
      return null;
    }

    if (bruto.diasSemana.length === 0) {
      this.notificacao.erro('Escolha pelo menos um dia de trabalho.');
      return null;
    }

    return {
      nome: bruto.nome,
      entradaMinutos,
      saidaMinutos,
      intervaloMinutos: bruto.intervaloMinutos,
      cargaSemanalMinutos: bruto.cargaHoras * 60 + bruto.cargaMinutos,
      toleranciaMinutos: bruto.toleranciaMinutos,
      diasSemana: [...bruto.diasSemana].sort((a, b) => a - b),
      ativa: bruto.ativa,
    };
  }

  private criar(dados: NonNullable<ReturnType<PaginaJornadaFormComponent['montarDados']>>): void {
    this.enviando.set(true);

    const { ativa: _ativa, ...corpo } = dados;

    this.servico
      .criar(corpo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.notificacao.sucesso('Jornada criada.');
          void this.router.navigate(['/jornadas']);
        },
        error: (erro: unknown) => this.tratarFalhaDeEnvio(erro),
      });
  }

  private atualizar(
    id: string,
    dados: NonNullable<ReturnType<PaginaJornadaFormComponent['montarDados']>>,
  ): void {
    const atual = this.jornada();
    if (atual === null) {
      return;
    }

    const mesmosDias =
      atual.diasSemana.length === dados.diasSemana.length &&
      atual.diasSemana.every((dia, indice) => dia === dados.diasSemana[indice]);

    // Envia somente o que mudou: menos superficie e historico mais legivel.
    const alteracoes: AtualizarJornadaRequest = {
      ...(dados.nome === atual.nome ? {} : { nome: dados.nome }),
      ...(dados.entradaMinutos === atual.entradaMinutos
        ? {}
        : { entradaMinutos: dados.entradaMinutos }),
      ...(dados.saidaMinutos === atual.saidaMinutos ? {} : { saidaMinutos: dados.saidaMinutos }),
      ...(dados.intervaloMinutos === atual.intervaloMinutos
        ? {}
        : { intervaloMinutos: dados.intervaloMinutos }),
      ...(dados.cargaSemanalMinutos === atual.cargaSemanalMinutos
        ? {}
        : { cargaSemanalMinutos: dados.cargaSemanalMinutos }),
      ...(dados.toleranciaMinutos === atual.toleranciaMinutos
        ? {}
        : { toleranciaMinutos: dados.toleranciaMinutos }),
      ...(mesmosDias ? {} : { diasSemana: dados.diasSemana }),
      ...(dados.ativa === atual.ativa ? {} : { ativa: dados.ativa }),
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
          this.jornada.set(atualizada);
          this.notificacao.sucesso('Jornada atualizada.');
          void this.router.navigate(['/jornadas']);
        },
        error: (erro: unknown) => this.tratarFalhaDeEnvio(erro),
      });
  }

  cancelar(): void {
    void this.router.navigate(['/jornadas']);
  }

  private tratarFalhaDeEnvio(erro: unknown): void {
    this.enviando.set(false);
    this.notificacao.erro(this.mensagem(erro, 'Nao foi possivel salvar a jornada.'));
  }

  private mensagem(erro: unknown, padrao: string): string {
    return erro instanceof HttpErrorResponse ? mensagemDoErro(erro) : padrao;
  }
}
