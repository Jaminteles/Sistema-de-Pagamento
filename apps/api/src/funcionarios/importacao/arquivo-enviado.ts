/**
 * Arquivo recebido em `multipart/form-data`.
 *
 * Tipo declarado aqui, e nao importado de @types/multer, para nao acrescentar
 * dependencia de tipos so por causa de um upload. Sao exatamente os campos que
 * a importacao usa.
 */
export interface ArquivoEnviado {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
