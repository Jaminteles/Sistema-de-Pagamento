import { Transform } from 'class-transformer';

/**
 * Transformacoes de query string compartilhadas pelos DTOs de listagem.
 *
 * Query string chega sempre como texto; sem isso, `@IsBoolean` e `@IsInt`
 * recusariam "true" e "2". Campo ausente ou vazio continua `undefined`, para o
 * service aplicar o padrao.
 */

export const paraBoolean = (): PropertyDecorator =>
  Transform(({ value }) => {
    if (value === undefined || value === '') {
      return undefined;
    }
    return value === true || value === 'true' || value === '1';
  });

export const paraInteiro = (): PropertyDecorator =>
  Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)));

/**
 * Lista de inteiros a partir de array ou de valor unico.
 *
 * `?diasSemana=1&diasSemana=2` chega como array; `?diasSemana=1` chega como
 * texto. Normaliza para array de numeros em ambos os casos.
 */
export const paraListaDeInteiros = (): PropertyDecorator =>
  Transform(({ value }) => {
    if (value === undefined || value === '') {
      return undefined;
    }
    const itens: unknown[] = Array.isArray(value) ? value : [value];
    return itens.map((item) => (typeof item === 'number' ? item : Number(item)));
  });
