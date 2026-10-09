import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app.config';

/**
 * Criptografia simetrica dos dados pessoais sensiveis em repouso (RNF-04).
 *
 * AES-256-GCM, do proprio node:crypto - sem biblioteca nova. O GCM e autenticado:
 * alterar um byte do texto cifrado faz a decifragem falhar em vez de devolver
 * lixo, o que impede troca silenciosa de chave Pix direto no banco.
 *
 * A chave vem exclusivamente da variavel de ambiente DADOS_PAGAMENTO_CHAVE
 * (32 bytes em base64). Nunca fica no repositorio, nunca vai para log e nunca
 * e devolvida pela API.
 *
 * Formato gravado: "v1.<iv>.<tag>.<cifrado>", tudo em base64url. O prefixo de
 * versao permite trocar o algoritmo depois sem adivinhar o formato do que ja
 * esta gravado.
 */
const VERSAO = 'v1';
const ALGORITMO = 'aes-256-gcm';
const TAMANHO_IV = 12;
const TAMANHO_TAG = 16;
export const TAMANHO_CHAVE_BYTES = 32;

export class ChaveCriptografiaInvalidaError extends Error {
  constructor() {
    super(
      `DADOS_PAGAMENTO_CHAVE precisa ser ${String(TAMANHO_CHAVE_BYTES)} bytes em base64. ` +
        'Gere com: node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))"',
    );
    this.name = 'ChaveCriptografiaInvalidaError';
  }
}

export class TextoCifradoInvalidoError extends Error {
  constructor() {
    super('Conteudo criptografado invalido ou chave de criptografia trocada.');
    this.name = 'TextoCifradoInvalidoError';
  }
}

@Injectable()
export class CriptografiaService {
  private readonly chave: Buffer;

  constructor(config: AppConfig) {
    this.chave = CriptografiaService.lerChave(config.dadosPagamentoChave);
  }

  /** Valida o tamanho da chave no boot: ambiente mal configurado nao sobe. */
  static lerChave(valorBase64: string): Buffer {
    let bruto: Buffer;
    try {
      bruto = Buffer.from(valorBase64, 'base64');
    } catch {
      throw new ChaveCriptografiaInvalidaError();
    }
    if (bruto.length !== TAMANHO_CHAVE_BYTES) {
      throw new ChaveCriptografiaInvalidaError();
    }
    return bruto;
  }

  criptografar(valor: string): string {
    const iv = randomBytes(TAMANHO_IV);
    const cifrador = createCipheriv(ALGORITMO, this.chave, iv);
    const cifrado = Buffer.concat([cifrador.update(valor, 'utf8'), cifrador.final()]);
    const tag = cifrador.getAuthTag();

    return [VERSAO, iv.toString('base64url'), tag.toString('base64url'), cifrado.toString('base64url')].join(
      '.',
    );
  }

  descriptografar(conteudo: string): string {
    const partes = conteudo.split('.');
    if (partes.length !== 4 || partes[0] !== VERSAO) {
      throw new TextoCifradoInvalidoError();
    }

    const iv = Buffer.from(partes[1] as string, 'base64url');
    const tag = Buffer.from(partes[2] as string, 'base64url');
    const cifrado = Buffer.from(partes[3] as string, 'base64url');

    if (iv.length !== TAMANHO_IV || tag.length !== TAMANHO_TAG) {
      throw new TextoCifradoInvalidoError();
    }

    try {
      const decifrador = createDecipheriv(ALGORITMO, this.chave, iv);
      decifrador.setAuthTag(tag);
      return Buffer.concat([decifrador.update(cifrado), decifrador.final()]).toString('utf8');
    } catch {
      throw new TextoCifradoInvalidoError();
    }
  }
}
