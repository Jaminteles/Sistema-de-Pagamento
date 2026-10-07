import type { Request } from 'express';
import type { ObjetoAuditavel } from './auditoria.types';

/** Detalhes que o service acrescenta ao registro de auditoria da requisicao. */
export interface DetalhesAuditoria {
  entidadeId?: string | null;
  antes?: ObjetoAuditavel | null;
  depois?: ObjetoAuditavel | null;
  /** Usado quando a acao nao tem sessao, como o proprio login. */
  usuarioId?: string | null;
  /**
   * Dispensa o registro nesta requisicao.
   *
   * Serve para endpoint que as vezes executa acao sensivel e as vezes nao:
   * trocar o perfil de um usuario e auditado, corrigir o nome dele nao e.
   */
  ignorar?: boolean;
}

/**
 * Caderno de notas da requisicao: o service anota o que mudou, o interceptor
 * grava depois de o handler ter sucesso.
 */
export class ColetorAuditoria {
  private detalhes: DetalhesAuditoria = {};

  anotar(detalhes: DetalhesAuditoria): void {
    this.detalhes = { ...this.detalhes, ...detalhes };
  }

  lerDetalhes(): DetalhesAuditoria {
    return this.detalhes;
  }
}

/**
 * Um coletor por requisicao, guardado num WeakMap para nao sujar o objeto
 * Request nem exigir provider com escopo de requisicao.
 */
const coletores = new WeakMap<Request, ColetorAuditoria>();

export function coletorDe(requisicao: Request): ColetorAuditoria {
  let coletor = coletores.get(requisicao);
  if (!coletor) {
    coletor = new ColetorAuditoria();
    coletores.set(requisicao, coletor);
  }
  return coletor;
}

export function coletorExistente(requisicao: Request): ColetorAuditoria | undefined {
  return coletores.get(requisicao);
}
