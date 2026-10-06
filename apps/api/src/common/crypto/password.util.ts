import * as argon2 from 'argon2';

/**
 * Hash de senha com argon2id (RNF-03).
 *
 * Parametros fixos aqui para que seed, login e troca de senha gerem hashes
 * compativeis. A senha em claro nunca e logada nem devolvida pela API.
 */
const OPCOES_ARGON2: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB - recomendacao OWASP
  timeCost: 2,
  parallelism: 1,
};

/** Tamanho minimo aceito para uma senha do sistema. */
export const SENHA_TAMANHO_MINIMO = 12;

// async de proposito: a validacao falha pela Promise, nunca de forma sincrona.
export async function gerarHashSenha(senha: string): Promise<string> {
  if (senha.length < SENHA_TAMANHO_MINIMO) {
    throw new Error(`A senha precisa de pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`);
  }
  return await argon2.hash(senha, OPCOES_ARGON2);
}

/** Comparacao em tempo constante feita pelo proprio argon2. */
export async function conferirSenha(hash: string, senha: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, senha);
  } catch {
    // Hash corrompido ou de formato desconhecido: trata como senha invalida.
    return false;
  }
}
