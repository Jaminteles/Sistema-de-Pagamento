import { apenasDigitos, cpfValido, mascararCpf } from './cpf.js';
import { TipoChavePix } from './enums/cadastros.js';

/**
 * Formato e mascara da chave Pix do funcionario (RF-007, RNF-05).
 *
 * A chave em claro nunca aparece numa resposta destinada a perfil sem
 * permissao: o back-end guarda a chave criptografada (RNF-04) e devolve a
 * mascara produzida aqui. O front usa as mesmas funcoes apenas para validar o
 * formulario antes de enviar - a validacao de verdade continua no servidor.
 */

export const CHAVE_PIX_TAMANHO_MAXIMO = 77;
export const BANCO_TAMANHO_MAXIMO = 10;
export const AGENCIA_TAMANHO_MAXIMO = 10;
export const CONTA_TAMANHO_MAXIMO = 20;

const PADRAO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Chave aleatoria (EVP): UUID v4 em minusculas ou maiusculas. */
const PADRAO_ALEATORIA =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** CNPJ com digitos verificadores validos. */
export function cnpjValido(valor: string): boolean {
  const digitos = apenasDigitos(valor);

  if (digitos.length !== 14 || /^(\d)\1{13}$/.test(digitos)) {
    return false;
  }

  const numeros: number[] = [...digitos].map(Number);

  for (const posicao of [12, 13]) {
    let peso = posicao - 7;
    let soma = 0;
    for (let indice = 0; indice < posicao; indice += 1) {
      soma += (numeros[indice] as number) * peso;
      peso -= 1;
      if (peso < 2) {
        peso = 9;
      }
    }
    const resto = soma % 11;
    const esperado = resto < 2 ? 0 : 11 - resto;
    if (esperado !== numeros[posicao]) {
      return false;
    }
  }

  return true;
}

/**
 * Normaliza a chave conforme o tipo: CPF, CNPJ e telefone ficam so com
 * digitos; e-mail em minusculas; chave aleatoria em minusculas.
 */
export function normalizarChavePix(tipo: TipoChavePix, chave: string): string {
  const limpa = chave.trim();

  switch (tipo) {
    case TipoChavePix.CPF:
    case TipoChavePix.CNPJ:
    case TipoChavePix.TELEFONE:
      return apenasDigitos(limpa);
    case TipoChavePix.EMAIL:
    case TipoChavePix.ALEATORIA:
      return limpa.toLowerCase();
  }
}

/** Verdadeiro quando a chave normalizada tem o formato do tipo informado. */
export function chavePixValida(tipo: TipoChavePix, chave: string): boolean {
  const valor = normalizarChavePix(tipo, chave);

  switch (tipo) {
    case TipoChavePix.CPF:
      return cpfValido(valor);
    case TipoChavePix.CNPJ:
      return cnpjValido(valor);
    case TipoChavePix.EMAIL:
      return valor.length <= CHAVE_PIX_TAMANHO_MAXIMO && PADRAO_EMAIL.test(valor);
    case TipoChavePix.TELEFONE:
      // Celular brasileiro com DDD (11 digitos) ou fixo (10 digitos).
      return valor.length === 10 || valor.length === 11;
    case TipoChavePix.ALEATORIA:
      return PADRAO_ALEATORIA.test(valor);
  }
}

/** Mantem os ultimos `visiveis` caracteres e troca o resto por asterisco. */
function somenteFinal(valor: string, visiveis: number): string {
  if (valor.length <= visiveis) {
    return '*'.repeat(Math.max(valor.length, 1));
  }
  return `${'*'.repeat(valor.length - visiveis)}${valor.slice(-visiveis)}`;
}

/**
 * Mascara de exibicao da chave Pix (RNF-05).
 *
 * Mostra o bastante para o operador reconhecer a chave e nunca o suficiente
 * para reconstrui-la. Esta mascara e o unico formato gravado em claro no banco.
 */
export function mascararChavePix(tipo: TipoChavePix, chave: string): string {
  const valor = normalizarChavePix(tipo, chave);

  switch (tipo) {
    case TipoChavePix.CPF:
      return mascararCpf(valor);
    case TipoChavePix.CNPJ:
      return somenteFinal(valor, 4);
    case TipoChavePix.TELEFONE:
      return somenteFinal(valor, 4);
    case TipoChavePix.EMAIL: {
      const [usuario = '', dominio = ''] = valor.split('@');
      const inicio = usuario.slice(0, 1);
      return `${inicio}${'*'.repeat(Math.max(usuario.length - 1, 1))}@${dominio}`;
    }
    case TipoChavePix.ALEATORIA:
      return somenteFinal(valor, 4);
  }
}

/** Mascara da conta bancaria (RNF-05): somente os ultimos digitos. */
export function mascararConta(conta: string): string {
  return somenteFinal(conta.trim(), 3);
}
