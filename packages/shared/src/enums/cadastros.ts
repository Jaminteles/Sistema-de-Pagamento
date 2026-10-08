/**
 * Enums dos modulos de cadastro (M2).
 * Os valores precisam ser identicos aos enums de apps/api/prisma/schema.prisma.
 */

/** RN-12: funcionario desligado continua visivel em periodos anteriores. */
export const SituacaoFuncionario = {
  ATIVO: 'ATIVO',
  AFASTADO: 'AFASTADO',
  DESLIGADO: 'DESLIGADO',
} as const;
export type SituacaoFuncionario = (typeof SituacaoFuncionario)[keyof typeof SituacaoFuncionario];

/** RF-007: tipo da chave Pix do funcionario. */
export const TipoChavePix = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'EMAIL',
  TELEFONE: 'TELEFONE',
  ALEATORIA: 'ALEATORIA',
} as const;
export type TipoChavePix = (typeof TipoChavePix)[keyof typeof TipoChavePix];

/** RF-011: abrangencia do feriado. */
export const AbrangenciaFeriado = {
  NACIONAL: 'NACIONAL',
  ESTADUAL: 'ESTADUAL',
  MUNICIPAL: 'MUNICIPAL',
} as const;
export type AbrangenciaFeriado = (typeof AbrangenciaFeriado)[keyof typeof AbrangenciaFeriado];

export const ABRANGENCIAS_FERIADO: readonly AbrangenciaFeriado[] = Object.values(AbrangenciaFeriado);

/** Rotulos para exibicao no front-end. */
export const ABRANGENCIA_FERIADO_LABEL: Readonly<Record<AbrangenciaFeriado, string>> = {
  NACIONAL: 'Nacional',
  ESTADUAL: 'Estadual',
  MUNICIPAL: 'Municipal',
};
