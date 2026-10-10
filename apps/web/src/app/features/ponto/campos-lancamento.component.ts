import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  aceitaMarcacao,
  type CampoLancamento,
  type ErroLancamentoResponse,
  OCORRENCIA_DIA_LABEL,
} from '@sistema/shared';
import { CAMPOS_HORA, type GrupoLancamento } from './lancamento-form';
import { SeletorOcorrenciaComponent } from './seletor-ocorrencia.component';

/**
 * Ocorrencia e os quatro horarios de um dia, com os erros que a API devolveu
 * (T-038 / RF-015 e RF-016).
 *
 * Os campos usam `type="time"`, que no celular abre o teclado de hora e no
 * desktop aceita digitacao direta - o que a RNF-02 pede para lancar 30 pessoas
 * em menos de 5 minutos. O `data-hora` marca os campos que o Enter percorre; a
 * navegacao em si fica na pagina, que conhece a ordem das linhas.
 *
 * Os valores sao lidos do formulario por metodo, e nao por `computed`: o valor
 * de um FormControl nao e signal, e a mudanca chega aqui pelo proprio evento do
 * campo, que ja dispara a verificacao deste componente.
 */
@Component({
  selector: 'app-campos-lancamento',
  imports: [
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule,
    SeletorOcorrenciaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './campos-lancamento.component.scss',
  template: `
    <div class="lancamento" [formGroup]="grupo()">
      <app-seletor-ocorrencia [controle]="grupo().controls.ocorrencia" />

      <div class="lancamento__horas">
        @for (campo of camposHora; track campo.campo) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ campo.rotulo }}</mat-label>
            <input
              matInput
              type="time"
              data-hora
              [formControlName]="campo.campo"
              [readonly]="!permiteHorario()"
              [attr.aria-invalid]="temErro(campo.tipo)"
              (keydown.enter)="enterNoCampo.emit($event)"
            />
          </mat-form-field>
        }
      </div>

      @if (!permiteHorario()) {
        <p class="lancamento__aviso">{{ rotuloOcorrencia() }} nao tem marcacao de horario.</p>
      }

      @if (mensagens().length > 0) {
        <ul class="lancamento__erros" role="alert">
          @for (mensagem of mensagens(); track mensagem) {
            <li>
              <mat-icon aria-hidden="true">error_outline</mat-icon>
              {{ mensagem }}
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class CamposLancamentoComponent {
  readonly grupo = input.required<GrupoLancamento>();
  /** Erros devolvidos pela API para este dia. */
  readonly erros = input<readonly ErroLancamentoResponse[]>([]);

  /**
   * Enter num campo de hora. A pagina decide qual e o proximo campo, porque e
   * ela que conhece a ordem das linhas (RNF-02).
   */
  readonly enterNoCampo = output<Event>();

  readonly camposHora = CAMPOS_HORA;

  readonly mensagens = computed(() => this.erros().map((erro) => erro.motivo));

  /** Horario so faz sentido no dia normal (RF-015). */
  permiteHorario(): boolean {
    return aceitaMarcacao(this.grupo().controls.ocorrencia.value);
  }

  rotuloOcorrencia(): string {
    return OCORRENCIA_DIA_LABEL[this.grupo().controls.ocorrencia.value];
  }

  temErro(campo: CampoLancamento): boolean {
    return this.erros().some((erro) => erro.campo === campo);
  }
}
