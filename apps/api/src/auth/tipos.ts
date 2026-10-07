import type { PerfilUsuario } from '@sistema/shared';
import type { Request } from 'express';

/**
 * Identidade minima anexada a requisicao pelo JwtAuthGuard.
 *
 * Tudo o que depende de autorizacao (perfil e escopo do encarregado, RN-05)
 * sai daqui, nunca de parametro enviado pelo cliente.
 */
export interface UsuarioRequisicao {
  id: string;
  perfil: PerfilUsuario;
  /** Sessao de refresh que originou o access token em uso. */
  sessaoId: string;
}

/** Requisicao que ja passou pelo JwtAuthGuard. */
export interface RequisicaoAutenticada extends Request {
  usuario?: UsuarioRequisicao;
}
