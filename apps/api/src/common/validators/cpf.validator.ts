import { cpfValido } from '@sistema/shared';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Valida CPF com digitos verificadores (RF-006).
 *
 * Aceita com ou sem pontuacao; o service grava somente os digitos. A regra
 * concreta fica em @sistema/shared, para o formulario do front-end usar
 * exatamente a mesma verificacao - sem duplicar a conta.
 */
@ValidatorConstraint({ name: 'ehCpf', async: false })
export class EhCpfConstraint implements ValidatorConstraintInterface {
  validate(valor: unknown): boolean {
    return typeof valor === 'string' && cpfValido(valor);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} precisa ser um CPF valido.`;
  }
}

export const EhCpf = (opcoes?: ValidationOptions): PropertyDecorator =>
  function aplicar(alvo: object, propriedade: string | symbol): void {
    registerDecorator({
      name: 'ehCpf',
      target: alvo.constructor,
      propertyName: propriedade as string,
      ...(opcoes ? { options: opcoes } : {}),
      validator: EhCpfConstraint,
    });
  };
