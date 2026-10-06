import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { mensagemDosErros } from '../../forms/mensagem-erro';

export type TipoCampoTexto = 'text' | 'email' | 'password' | 'tel' | 'number' | 'date';

/**
 * Campo de texto padrao do projeto: rotulo, dica e mensagem de erro
 * padronizadas sobre um Reactive Form tipado.
 *
 * O control vem por propriedade (e nao projetado por ng-content) porque o
 * mat-form-field precisa do controle dentro do proprio template para encontrar
 * o MatFormFieldControl.
 *
 * Quem decide *quando* mostrar o erro e o proprio mat-form-field (campo
 * invalido e tocado, ou formulario submetido); aqui so definimos o texto.
 *
 * Uso:
 *   <app-campo-texto rotulo="E-mail" tipo="email" [control]="form.controls.email" />
 */
@Component({
  selector: 'app-campo-texto',
  imports: [MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" class="campo">
      <mat-label>{{ rotulo() }}</mat-label>
      <input
        matInput
        [type]="tipo()"
        [formControl]="control()"
        [attr.autocomplete]="autocomplete()"
        [attr.inputmode]="inputmode()"
        [attr.maxlength]="tamanhoMaximo()"
        [required]="obrigatorio()"
      />
      @if (dica()) {
        <mat-hint>{{ dica() }}</mat-hint>
      }
      <mat-error>{{ textoErro() }}</mat-error>
    </mat-form-field>
  `,
  styles: `
    .campo {
      width: 100%;
    }
  `,
})
export class CampoTextoComponent {
  readonly rotulo = input.required<string>();
  readonly control = input.required<FormControl<string | null>>();
  readonly tipo = input<TipoCampoTexto>('text');
  readonly dica = input<string | null>(null);
  readonly autocomplete = input<string | null>(null);
  /** Teclado numerico no celular acelera o lancamento de ponto (RNF-02). */
  readonly inputmode = input<string | null>(null);
  readonly tamanhoMaximo = input<number | null>(null);
  readonly obrigatorio = input(false);

  /**
   * Metodo (nao computed) de proposito: os erros de um FormControl nao sao
   * signals, e o mat-form-field dispara a deteccao de mudanca ao alterar o
   * estado de erro do campo.
   */
  textoErro(): string {
    const errors = this.control().errors;
    return errors ? mensagemDosErros(errors) : '';
  }
}
