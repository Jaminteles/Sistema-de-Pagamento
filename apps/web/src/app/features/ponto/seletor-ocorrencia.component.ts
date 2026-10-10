import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { OCORRENCIA_DIA_LABEL, OCORRENCIAS_DIA, type OcorrenciaDia } from '@sistema/shared';

/**
 * Seletor de ocorrencia do dia (T-038 / RF-015).
 *
 * A lista vem de packages/shared, a mesma que o back-end valida: nada de
 * repetir "falta, atestado, folga..." em cada tela.
 *
 * Ocorrencia diferente de Normal apaga as marcacoes do dia na API; a tela
 * desabilita os horarios para o usuario ver isso antes de salvar.
 */
@Component({
  selector: 'app-seletor-ocorrencia',
  imports: [MatFormFieldModule, MatSelectModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" class="seletor-ocorrencia" [subscriptSizing]="'dynamic'">
      <mat-label>{{ rotulo() }}</mat-label>
      <mat-select [formControl]="controle()" [attr.aria-label]="rotulo()">
        @for (ocorrencia of ocorrencias; track ocorrencia) {
          <mat-option [value]="ocorrencia">{{ rotulos[ocorrencia] }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
  styles: `
    .seletor-ocorrencia {
      width: 100%;
      min-width: 8rem;
    }
  `,
})
export class SeletorOcorrenciaComponent {
  readonly controle = input.required<FormControl<OcorrenciaDia>>();
  readonly rotulo = input('Ocorrencia');

  readonly ocorrencias = OCORRENCIAS_DIA;
  readonly rotulos = OCORRENCIA_DIA_LABEL;
}
