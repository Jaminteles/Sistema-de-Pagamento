import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  AJUSTE_JUSTIFICATIVA_TAMANHO_MAXIMO,
  AJUSTE_JUSTIFICATIVA_TAMANHO_MINIMO,
  type AjustarDiaRequest,
  type AjustePontoResponse,
  CAMPO_AJUSTE_LABEL,
  type DiaPontoResponse,
  LOCALE_PADRAO,
  OCORRENCIA_DIA_LABEL,
  TIMEZONE_NEGOCIO,
} from '@sistema/shared';
import { mensagemDoErro } from '../../core/http/erro-api';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { CamposLancamentoComponent } from './campos-lancamento.component';
import { formatarData } from './datas-ponto';
import { criarGrupo, type GrupoLancamento, paraMarcacoes } from './lancamento-form';
import { PontoService } from './ponto.service';

/** O que a tela precisa informar para abrir o ajuste de um dia. */
export interface DadosAjustePonto {
  dia: DiaPontoResponse;
  funcionarioNome: string;
}

const FORMATADOR_MOMENTO = new Intl.DateTimeFormat(LOCALE_PADRAO, {
  timeZone: TIMEZONE_NEGOCIO,
  dateStyle: 'short',
  timeStyle: 'short',
});

/**
 * Modal de ajuste de ponto com justificativa e linha do tempo (T-045 / RF-017).
 *
 * Um modal, e nao uma tela: o ajuste e uma correcao pontual feita a partir da
 * grade ou da visao do funcionario, e tirar o usuario do contexto do dia que
 * ele esta conferindo atrapalharia a conferencia.
 *
 * A justificativa e obrigatoria aqui e no back-end. O historico aparece junto
 * do formulario de proposito: quem corrige precisa ver o que ja foi corrigido
 * antes - e por quem - para nao desfazer o ajuste de outra pessoa.
 *
 * Nenhum total e calculado aqui. O dia volta da API ja reapurado (RF-020).
 */
@Component({
  selector: 'app-modal-ajuste-ponto',
  imports: [
    CamposLancamentoComponent,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './modal-ajuste-ponto.component.scss',
  template: `
    <h2 mat-dialog-title>Ajustar o ponto de {{ dados.funcionarioNome }}</h2>

    <mat-dialog-content>
      <p class="ajuste__dia">{{ rotuloData }}</p>

      <app-campos-lancamento [grupo]="grupo" />

      <mat-form-field appearance="outline" class="ajuste__justificativa">
        <mat-label>Justificativa do ajuste</mat-label>
        <textarea
          matInput
          rows="3"
          [formControl]="justificativa"
          [attr.maxlength]="tamanhoMaximo"
          required
        ></textarea>
        <mat-hint>Obrigatoria: fica no historico do dia, com o seu nome.</mat-hint>
        @if (justificativa.touched && justificativa.invalid) {
          <mat-error>Explique o ajuste em pelo menos {{ tamanhoMinimo }} caracteres.</mat-error>
        }
      </mat-form-field>

      @if (erro()) {
        <p class="ajuste__erro" role="alert">
          <mat-icon aria-hidden="true">error_outline</mat-icon>
          {{ erro() }}
        </p>
      }

      <section class="ajuste__historico">
        <h3>Historico de alteracoes</h3>

        @if (carregandoHistorico()) {
          <p class="ajuste__vazio" role="status">Carregando o historico...</p>
        } @else if (historico().length === 0) {
          <p class="ajuste__vazio">Este dia ainda nao foi ajustado.</p>
        } @else {
          <ol class="linha-tempo">
            @for (item of historico(); track item.id) {
              <li class="linha-tempo__item">
                <p class="linha-tempo__mudanca">
                  <strong>{{ rotulos[item.campo] }}</strong>
                  <span>{{ valor(item.valorAnterior) }} &rarr; {{ valor(item.valorNovo) }}</span>
                </p>
                <p class="linha-tempo__autor">
                  {{ item.usuarioNome }} &middot; {{ momento(item.criadoEm) }}
                </p>
                <p class="linha-tempo__justificativa">{{ item.justificativa }}</p>
              </li>
            }
          </ol>
        }
      </section>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton type="button" [disabled]="salvando()" (click)="fechar()">Cancelar</button>
      <button matButton="filled" type="button" [disabled]="salvando()" (click)="salvar()">
        <mat-icon aria-hidden="true">save</mat-icon>
        {{ salvando() ? 'Salvando...' : 'Salvar ajuste' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ModalAjustePontoComponent {
  private readonly servico = inject(PontoService);
  private readonly notificacao = inject(NotificacaoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly dialogRef =
    inject<MatDialogRef<ModalAjustePontoComponent, DiaPontoResponse | undefined>>(MatDialogRef);
  readonly dados = inject<DadosAjustePonto>(MAT_DIALOG_DATA);

  readonly tamanhoMinimo = AJUSTE_JUSTIFICATIVA_TAMANHO_MINIMO;
  readonly tamanhoMaximo = AJUSTE_JUSTIFICATIVA_TAMANHO_MAXIMO;
  readonly rotulos = CAMPO_AJUSTE_LABEL;
  readonly rotuloData = formatarData(this.dados.dia.data);

  readonly historico = signal<readonly AjustePontoResponse[]>([]);
  readonly carregandoHistorico = signal(true);
  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);

  /** O grupo nasce habilitado: o dia nao editavel nem abre o modal. */
  readonly grupo: GrupoLancamento = criarGrupo({ ...this.dados.dia, editavel: true });

  readonly justificativa = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(AJUSTE_JUSTIFICATIVA_TAMANHO_MINIMO)],
  });

  constructor() {
    this.carregarHistorico();
  }

  private carregarHistorico(): void {
    this.servico
      .historicoDeAjustes(this.dados.dia.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (historico) => {
          this.historico.set(historico);
          this.carregandoHistorico.set(false);
        },
        error: () => {
          // O historico e contexto, nao bloqueio: sem ele o ajuste continua
          // possivel, e a API segue sendo quem valida.
          this.historico.set([]);
          this.carregandoHistorico.set(false);
        },
      });
  }

  valor(texto: string | null): string {
    if (texto === null) {
      return '(vazio)';
    }
    return (OCORRENCIA_DIA_LABEL as Record<string, string | undefined>)[texto] ?? texto;
  }

  momento(iso: string): string {
    return FORMATADOR_MOMENTO.format(new Date(iso));
  }

  fechar(): void {
    this.dialogRef.close(undefined);
  }

  salvar(): void {
    if (this.salvando()) {
      return;
    }

    this.justificativa.markAsTouched();
    if (this.justificativa.invalid) {
      return;
    }

    const valores = this.grupo.getRawValue();
    const corpo: AjustarDiaRequest = {
      justificativa: this.justificativa.value.trim(),
      ocorrencia: valores.ocorrencia,
      observacao: valores.observacao === '' ? null : valores.observacao,
      ...paraMarcacoes(this.grupo),
    };

    this.salvando.set(true);
    this.erro.set(null);

    this.servico
      .ajustarDia(this.dados.dia.id, corpo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.salvando.set(false);
          this.notificacao.sucesso('Ajuste gravado no historico do dia.');
          this.dialogRef.close(resposta.dia);
        },
        error: (erro: unknown) => {
          this.salvando.set(false);
          this.erro.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel gravar o ajuste.',
          );
        },
      });
  }
}
