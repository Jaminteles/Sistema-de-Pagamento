import { SetMetadata } from '@nestjs/common';
import type { AcaoAuditoria } from '@sistema/shared';

export const AUDITORIA_OPCOES = 'auditoria_opcoes';

export interface OpcoesAuditoria {
  acao: AcaoAuditoria;
  /** Nome da entidade afetada, em minusculas (ex.: "usuario"). */
  entidade: string;
  /** Parametro de rota que identifica a entidade. Padrao: "id". */
  parametroId?: string;
}

/**
 * Marca o endpoint como acao sensivel (RF-005). O AuditoriaInterceptor grava o
 * log apenas quando o handler termina sem erro.
 *
 * Detalhes de antes/depois sao informados pelo service atraves do
 * ColetorAuditoria.
 */
export const Auditar = (opcoes: OpcoesAuditoria): MethodDecorator =>
  SetMetadata(AUDITORIA_OPCOES, opcoes);
