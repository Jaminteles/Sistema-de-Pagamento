/**
 * Enums dos modulos de ponto e apuracao (M3 e M4).
 * Os valores precisam ser identicos aos enums de apps/api/prisma/schema.prisma.
 */

/** RN-07: periodo fechado nao aceita alteracao; reabrir exige motivo. */
export const StatusPeriodo = {
  ABERTO: 'ABERTO',
  EM_CONFERENCIA: 'EM_CONFERENCIA',
  FECHADO: 'FECHADO',
} as const;
export type StatusPeriodo = (typeof StatusPeriodo)[keyof typeof StatusPeriodo];

/** RF-015: ocorrencias do dia. */
export const OcorrenciaDia = {
  NORMAL: 'NORMAL',
  FALTA: 'FALTA',
  FALTA_JUSTIFICADA: 'FALTA_JUSTIFICADA',
  ATESTADO: 'ATESTADO',
  FOLGA: 'FOLGA',
  FERIAS: 'FERIAS',
  AFASTAMENTO: 'AFASTAMENTO',
} as const;
export type OcorrenciaDia = (typeof OcorrenciaDia)[keyof typeof OcorrenciaDia];

/** RN-06: depois de enviado ao RH, o encarregado nao altera mais o periodo. */
export const StatusEnvioDia = {
  NAO_ENVIADO: 'NAO_ENVIADO',
  ENVIADO_RH: 'ENVIADO_RH',
  CONFERIDO: 'CONFERIDO',
} as const;
export type StatusEnvioDia = (typeof StatusEnvioDia)[keyof typeof StatusEnvioDia];

/** RF-016: a ordem cronologica esperada segue a ordem desta lista. */
export const TipoMarcacao = {
  ENTRADA: 'ENTRADA',
  SAIDA_INTERVALO: 'SAIDA_INTERVALO',
  RETORNO_INTERVALO: 'RETORNO_INTERVALO',
  SAIDA: 'SAIDA',
} as const;
export type TipoMarcacao = (typeof TipoMarcacao)[keyof typeof TipoMarcacao];

export const ORDEM_MARCACAO: readonly TipoMarcacao[] = [
  TipoMarcacao.ENTRADA,
  TipoMarcacao.SAIDA_INTERVALO,
  TipoMarcacao.RETORNO_INTERVALO,
  TipoMarcacao.SAIDA,
];

/** Origem da marcacao: manual (RF-013/014), importada (RF-019) ou ajuste (RF-017). */
export const OrigemMarcacao = {
  MANUAL: 'MANUAL',
  IMPORTADO: 'IMPORTADO',
  AJUSTE: 'AJUSTE',
} as const;
export type OrigemMarcacao = (typeof OrigemMarcacao)[keyof typeof OrigemMarcacao];

export const OCORRENCIAS_DIA: readonly OcorrenciaDia[] = Object.values(OcorrenciaDia);

/** Rotulos para exibicao no front-end. */
export const OCORRENCIA_DIA_LABEL: Readonly<Record<OcorrenciaDia, string>> = {
  NORMAL: 'Normal',
  FALTA: 'Falta',
  FALTA_JUSTIFICADA: 'Falta justificada',
  ATESTADO: 'Atestado',
  FOLGA: 'Folga',
  FERIAS: 'Ferias',
  AFASTAMENTO: 'Afastamento',
};

/**
 * Somente o dia NORMAL tem marcacao de ponto (RF-015).
 *
 * Nas demais ocorrencias a pessoa nao trabalhou: registrar horario junto de
 * falta, folga ou ferias seria contradicao, e a apuracao (RF-020) usaria os dois
 * ao mesmo tempo. Trocar a ocorrencia de um dia ja lancado apaga as marcacoes.
 */
export function aceitaMarcacao(ocorrencia: OcorrenciaDia): boolean {
  return ocorrencia === OcorrenciaDia.NORMAL;
}

export const STATUS_PERIODO_LABEL: Readonly<Record<StatusPeriodo, string>> = {
  ABERTO: 'Aberto',
  EM_CONFERENCIA: 'Em conferencia',
  FECHADO: 'Fechado',
};

export const STATUS_ENVIO_DIA_LABEL: Readonly<Record<StatusEnvioDia, string>> = {
  NAO_ENVIADO: 'Nao enviado',
  ENVIADO_RH: 'Enviado ao RH',
  CONFERIDO: 'Conferido',
};

export const TIPO_MARCACAO_LABEL: Readonly<Record<TipoMarcacao, string>> = {
  ENTRADA: 'Entrada',
  SAIDA_INTERVALO: 'Saida do intervalo',
  RETORNO_INTERVALO: 'Retorno do intervalo',
  SAIDA: 'Saida',
};

export const STATUS_PERIODO: readonly StatusPeriodo[] = Object.values(StatusPeriodo);
export const TIPOS_MARCACAO: readonly TipoMarcacao[] = Object.values(TipoMarcacao);
