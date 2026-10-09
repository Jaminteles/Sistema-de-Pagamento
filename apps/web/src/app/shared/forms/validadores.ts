import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { chavePixValida, cpfValido, type TipoChavePix } from '@sistema/shared';

/**
 * Validadores que espelham os DTOs do back-end.
 *
 * A regra concreta vive em @sistema/shared e e a mesma que a API usa; aqui ela
 * so evita uma ida ao servidor para avisar o obvio. A validacao de verdade
 * continua sendo a do back-end.
 */

/** CPF com digitos verificadores validos (RF-006). */
export const cpfValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const valor: unknown = control.value;
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    return null;
  }
  return cpfValido(valor) ? null : { cpf: true };
};

/**
 * Chave Pix coerente com o tipo selecionado (RF-007).
 *
 * Recebe o tipo por funcao porque ele vem de outro control do mesmo
 * formulario e muda enquanto o usuario preenche.
 */
export function chavePixValidator(tipo: () => TipoChavePix | null): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const valor: unknown = control.value;
    const tipoAtual = tipo();

    if (typeof valor !== 'string' || valor.trim().length === 0 || tipoAtual === null) {
      return null;
    }
    return chavePixValida(tipoAtual, valor) ? null : { chavePix: true };
  };
}
