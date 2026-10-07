import type { AcaoAuditoria } from '@sistema/shared';

/** Valor que pode ir para a coluna Json do log. */
export type ValorAuditavel =
  | string
  | number
  | boolean
  | null
  | ValorAuditavel[]
  | { [chave: string]: ValorAuditavel };

/** Mapa de campos auditados (o "antes" e o "depois" de uma mudanca). */
export type ObjetoAuditavel = { [chave: string]: ValorAuditavel };

/** Dados de origem da requisicao que acompanham o registro de auditoria. */
export interface OrigemRequisicao {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Entrada do log de auditoria (RF-005).
 *
 * `antes` e `depois` guardam somente os campos relevantes da mudanca. Nunca
 * coloque aqui token, senha, hash, credencial, certificado, CPF, chave Pix ou
 * conta: o AuditoriaService remove esses campos, mas o chamador nao deve
 * depender disso.
 */
export interface EntradaAuditoria {
  /** Autor da acao. Nulo apenas quando a acao ocorre sem sessao (login falho). */
  usuarioId?: string | null;
  acao: AcaoAuditoria;
  /** Nome da entidade afetada, em minusculas (ex.: "usuario"). */
  entidade: string;
  entidadeId?: string | null;
  antes?: ObjetoAuditavel | null;
  depois?: ObjetoAuditavel | null;
  origem?: OrigemRequisicao;
}
