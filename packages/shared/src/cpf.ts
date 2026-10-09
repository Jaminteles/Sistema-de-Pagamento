/**
 * Apoio de CPF compartilhado entre a API e o front-end (RF-006, RNF-05).
 *
 * O CPF e guardado somente com digitos. A formatacao e a mascara acontecem na
 * borda: o back-end decide o que cada perfil pode ver (RNF-05) e o front-end
 * apenas exibe o texto recebido.
 */

export const CPF_TAMANHO = 11;

/** Remove tudo que nao e digito. */
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/**
 * Verdadeiro quando os 11 digitos formam um CPF com digitos verificadores
 * validos. Sequencia repetida (00000000000, 11111111111, ...) e recusada.
 */
export function cpfValido(valor: string): boolean {
  const digitos = apenasDigitos(valor);

  if (digitos.length !== CPF_TAMANHO) {
    return false;
  }
  if (/^(\d)\1{10}$/.test(digitos)) {
    return false;
  }

  const numeros: number[] = [...digitos].map(Number);

  for (const posicao of [9, 10]) {
    let soma = 0;
    for (let indice = 0; indice < posicao; indice += 1) {
      soma += (numeros[indice] as number) * (posicao + 1 - indice);
    }
    const resto = (soma * 10) % 11;
    const esperado = resto === 10 ? 0 : resto;
    if (esperado !== numeros[posicao]) {
      return false;
    }
  }

  return true;
}

/** "12345678901" para "123.456.789-01". Devolve a entrada se nao tiver 11 digitos. */
export function formatarCpf(valor: string): string {
  const digitos = apenasDigitos(valor);
  if (digitos.length !== CPF_TAMANHO) {
    return valor;
  }
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

/**
 * CPF mascarado para perfil sem permissao de ver o dado completo (RNF-05):
 * "***.456.789-**". Mantem digitos do meio apenas para o operador reconhecer a
 * pessoa; nao permite reconstruir o numero.
 */
export function mascararCpf(valor: string): string {
  const digitos = apenasDigitos(valor);
  if (digitos.length !== CPF_TAMANHO) {
    return '***.***.***-**';
  }
  return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
}
