/**
 * Enums dos modulos de valores a pagar e pagamentos Pix (M5 e M6).
 * Os valores precisam ser identicos aos enums de apps/api/prisma/schema.prisma.
 */

/** RF-027 e RF-028: natureza do valor a pagar. */
export const TipoValorPagar = {
  SALARIO: 'SALARIO',
  ADIANTAMENTO: 'ADIANTAMENTO',
  DIARIA: 'DIARIA',
  AJUDA_CUSTO: 'AJUDA_CUSTO',
  OUTROS: 'OUTROS',
} as const;
export type TipoValorPagar = (typeof TipoValorPagar)[keyof typeof TipoValorPagar];

/** RF-027 (importado do contador) e RF-028 (lancado avulso). */
export const OrigemValorPagar = {
  IMPORTADO: 'IMPORTADO',
  AVULSO: 'AVULSO',
} as const;
export type OrigemValorPagar = (typeof OrigemValorPagar)[keyof typeof OrigemValorPagar];

/** RN-09 e RN-10: lote aprovado e imutavel; quem monta nao aprova. */
export const StatusLotePagamento = {
  RASCUNHO: 'RASCUNHO',
  AGUARDANDO_APROVACAO: 'AGUARDANDO_APROVACAO',
  APROVADO: 'APROVADO',
  EM_ENVIO: 'EM_ENVIO',
  CONCLUIDO: 'CONCLUIDO',
  CANCELADO: 'CANCELADO',
} as const;
export type StatusLotePagamento = (typeof StatusLotePagamento)[keyof typeof StatusLotePagamento];

/** RN-11: so vira PAGO apos confirmacao do banco. */
export const StatusLoteItem = {
  PENDENTE: 'PENDENTE',
  ENVIADO: 'ENVIADO',
  PAGO: 'PAGO',
  FALHOU: 'FALHOU',
  DEVOLVIDO: 'DEVOLVIDO',
} as const;
export type StatusLoteItem = (typeof StatusLoteItem)[keyof typeof StatusLoteItem];
