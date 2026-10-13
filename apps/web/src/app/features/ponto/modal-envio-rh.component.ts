import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import type { EnviarPeriodoRhResponse, ResumoEnvioRhResponse } from '@sistema/shared';
import { mensagemDoErro } from '../../core/http/erro-api';
import { EstadoConteudoComponent } from '../../shared/components/estado-conteudo/estado-conteudo.component';
import { formatarDiaMes } from './datas-ponto';
import { PontoService } from './ponto.service';

/** O periodo e a obra cuja equipe sera enviada ao RH. */
export interface DadosEnvioRh {
  periodoId: string;
  competencia: string;
  obraId: string;
  obraNome: string;
}

/**
 * Envio do periodo da equipe ao RH, com resumo de pendencias (T-046 / RF-018).
 *
 * O resumo vem antes da confirmacao porque o envio e de mao unica para o
 * encarregado: depois dele ele nao altera mais aqueles dias (RN-06). Ver quantos
 * dias estao sem lancamento antes de confirmar e o que evita o pedido de
 * reabertura no dia seguinte.
 *
 * Pendencia nao bloqueia o envio - um dia pode estar legitimamente sem
 * lancamento -, mas aparece listada por funcionario. Quem decide se aceita o
 * envio e a API.
 */
@Component({
  selector: 'app-modal-envio-rh',
  imports: [EstadoConteudoComponent, MatButtonModule, MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './modal-envio-rh.component.scss',
  template: `
    <h2 mat-dialog-title>Enviar o ponto da equipe ao RH</h2>

    <mat-dialog-content>
      <app-estado-conteudo
        [carregando]="carregando()"
        [erro]="erro()"
        mensagemCarregando="Conferindo a equipe do periodo..."
        (recarregar)="carregar()"
      >
        @if (resumo(); as dados) {
          <p class="envio__cabecalho">
            {{ dados.obraNome }} &middot; competencia {{ dados.periodo.competencia }}
          </p>

          <dl class="envio__numeros">
            <div>
              <dt>Funcionarios</dt>
              <dd>{{ dados.funcionarios }}</dd>
            </div>
            <div>
              <dt>Dias a enviar</dt>
              <dd>{{ dados.diasNaoEnviados }}</dd>
            </div>
            <div>
              <dt>Ja enviados</dt>
              <dd>{{ dados.diasEnviados }}</dd>
            </div>
            <div>
              <dt>Pendencias</dt>
              <dd>{{ dados.totalPendencias }}</dd>
            </div>
          </dl>

          @if (!dados.podeEnviar) {
            <p class="envio__bloqueio" role="alert">
              <mat-icon aria-hidden="true">lock</mat-icon>
              {{ dados.motivoBloqueio }}
            </p>
          } @else if (dados.totalPendencias === 0) {
            <p class="envio__ok" role="status">
              <mat-icon aria-hidden="true">check_circle</mat-icon>
              Nenhuma pendencia na equipe.
            </p>
          } @else {
            <p class="envio__aviso" role="status">
              <mat-icon aria-hidden="true">warning_amber</mat-icon>
              Depois do envio voce nao altera mais estes dias; o RH passa a fazer os ajustes.
            </p>

            <ul class="pendencias">
              @for (item of dados.pendencias; track item.funcionarioId) {
                <li>
                  <p class="pendencias__pessoa">
                    {{ item.funcionarioNome }}
                    <span>Mat. {{ item.matricula }}</span>
                  </p>
                  @if (item.diasSemLancamento.length > 0) {
                    <p class="pendencias__detalhe">
                      Sem lancamento: {{ dias(item.diasSemLancamento) }}
                    </p>
                  }
                  @if (item.diasIncompletos.length > 0) {
                    <p class="pendencias__detalhe">
                      Marcacao incompleta: {{ dias(item.diasIncompletos) }}
                    </p>
                  }
                </li>
              }
            </ul>
          }

          @if (erroEnvio()) {
            <p class="envio__bloqueio" role="alert">
              <mat-icon aria-hidden="true">error_outline</mat-icon>
              {{ erroEnvio() }}
            </p>
          }
        }
      </app-estado-conteudo>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button matButton type="button" [disabled]="enviando()" (click)="fechar()">Cancelar</button>
      <button
        matButton="filled"
        type="button"
        [disabled]="enviando() || !resumo()?.podeEnviar"
        (click)="enviar()"
      >
        <mat-icon aria-hidden="true">send</mat-icon>
        {{ enviando() ? 'Enviando...' : 'Enviar ao RH' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ModalEnvioRhComponent {
  private readonly servico = inject(PontoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly dialogRef =
    inject<MatDialogRef<ModalEnvioRhComponent, EnviarPeriodoRhResponse | undefined>>(MatDialogRef);
  readonly dados = inject<DadosEnvioRh>(MAT_DIALOG_DATA);

  readonly resumo = signal<ResumoEnvioRhResponse | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly enviando = signal(false);
  readonly erroEnvio = signal<string | null>(null);

  constructor() {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.servico
      .resumoEnvio(this.dados.periodoId, this.dados.obraId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resumo) => {
          this.resumo.set(resumo);
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.resumo.set(null);
          this.erro.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel conferir a equipe do periodo.',
          );
          this.carregando.set(false);
        },
      });
  }

  /** "07/12, 08/12 e mais 3" - a lista inteira nao cabe no modal. */
  dias(datas: readonly string[]): string {
    const mostrados = datas.slice(0, 6).map((data) => formatarDiaMes(data));
    const restantes = datas.length - mostrados.length;
    return restantes > 0
      ? `${mostrados.join(', ')} e mais ${String(restantes)}`
      : mostrados.join(', ');
  }

  fechar(): void {
    this.dialogRef.close(undefined);
  }

  enviar(): void {
    if (this.enviando()) {
      return;
    }

    this.enviando.set(true);
    this.erroEnvio.set(null);

    this.servico
      .enviarAoRh(this.dados.periodoId, this.dados.obraId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.enviando.set(false);
          this.dialogRef.close(resposta);
        },
        error: (erro: unknown) => {
          this.enviando.set(false);
          this.erroEnvio.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel enviar o periodo ao RH.',
          );
        },
      });
  }
}
