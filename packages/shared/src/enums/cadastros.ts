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

export const SITUACOES_FUNCIONARIO: readonly SituacaoFuncionario[] =
  Object.values(SituacaoFuncionario);

/** Rotulos para exibicao no front-end. */
export const SITUACAO_FUNCIONARIO_LABEL: Readonly<Record<SituacaoFuncionario, string>> = {
  ATIVO: 'Ativo',
  AFASTADO: 'Afastado',
  DESLIGADO: 'Desligado',
};

/** RF-007: tipo da chave Pix do funcionario. */
export const TipoChavePix = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'EMAIL',
  TELEFONE: 'TELEFONE',
  ALEATORIA: 'ALEATORIA',
} as const;
export type TipoChavePix = (typeof TipoChavePix)[keyof typeof TipoChavePix];

export const TIPOS_CHAVE_PIX: readonly TipoChavePix[] = Object.values(TipoChavePix);

/** Rotulos para exibicao no front-end. */
export const TIPO_CHAVE_PIX_LABEL: Readonly<Record<TipoChavePix, string>> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'E-mail',
  TELEFONE: 'Telefone',
  ALEATORIA: 'Chave aleatoria',
};

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
