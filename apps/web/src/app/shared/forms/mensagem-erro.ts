import type { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Chave usada para colocar no control um erro devolvido pela API (400/409).
 *
 *   form.controls.email.setErrors({ [ERRO_SERVIDOR]: 'E-mail ja cadastrado.' });
 */
export const ERRO_SERVIDOR = 'servidor';

/**
 * Mensagens padrao de validacao, espelhando os DTOs do back-end.
 * A validacao de verdade continua sendo a do servidor.
 */
const MENSAGENS: Record<string, (erro: unknown) => string> = {
  [ERRO_SERVIDOR]: (erro) => (typeof erro === 'string' ? erro : 'Valor invalido.'),
  required: () => 'Campo obrigatorio.',
  email: () => 'Informe um e-mail valido.',
  minlength: (erro) =>
    `Minimo de ${String((erro as { requiredLength: number }).requiredLength)} caracteres.`,
  maxlength: (erro) =>
    `Maximo de ${String((erro as { requiredLength: number }).requiredLength)} caracteres.`,
  min: (erro) => `Valor minimo: ${String((erro as { min: number }).min)}.`,
  max: (erro) => `Valor maximo: ${String((erro as { max: number }).max)}.`,
  pattern: () => 'Formato invalido.',
  cpf: () => 'CPF invalido.',
  chavePix: () => 'Chave Pix invalida para o tipo escolhido.',
};

/**
 * Primeira mensagem aplicavel aos erros de um control.
 * O erro do servidor tem prioridade sobre os validadores locais.
 */
export function mensagemDosErros(errors: ValidationErrors): string {
  const doServidor: unknown = errors[ERRO_SERVIDOR];
  if (typeof doServidor === 'string' && doServidor !== '') {
    return doServidor;
  }

  for (const [chave, valor] of Object.entries(errors)) {
    const construtor = MENSAGENS[chave];
    if (construtor) {
      return construtor(valor);
    }
  }

  return 'Valor invalido.';
}

/**
 * Mensagem a exibir para um campo.
 *
 * A validacao local so aparece depois de o usuario tocar no campo, para o
 * formulario nao abrir cheio de erro.
 */
export function mensagemDoCampo(control: AbstractControl | null | undefined): string | null {
  if (!control || !control.errors) {
    return null;
  }

  if (!control.touched && control.errors[ERRO_SERVIDOR] === undefined) {
    return null;
  }

  return mensagemDosErros(control.errors);
}
