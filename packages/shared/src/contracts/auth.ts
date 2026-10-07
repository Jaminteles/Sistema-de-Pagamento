import type { PerfilUsuario } from '../enums/perfil-usuario.js';

/** Tamanho minimo de senha exigido pela API (RNF-03). */
export const SENHA_TAMANHO_MINIMO = 12;
export const SENHA_TAMANHO_MAXIMO = 128;

/** POST /api/auth/login */
export interface LoginRequest {
  email: string;
  senha: string;
}

/**
 * Usuario autenticado, devolvido no login, no refresh e em GET /api/auth/eu.
 *
 * Nao carrega hash de senha nem qualquer segredo. `obrasIds` existe apenas para
 * o ENCARREGADO e serve somente a experiencia de uso: o escopo por obra (RN-05)
 * e sempre aplicado no back-end a partir do usuario autenticado.
 */
export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  obrasIds: string[];
}

/**
 * Resposta de login e de refresh.
 *
 * O access token vem no corpo e deve ficar somente em memoria no front-end.
 * O refresh token NAO aparece aqui: ele viaja em cookie httpOnly.
 */
export interface SessaoResponse {
  accessToken: string;
  /** Validade do access token em segundos, para agendar a renovacao. */
  expiraEmSegundos: number;
  usuario: UsuarioAutenticado;
}

/** PATCH /api/auth/senha - troca de senha pelo proprio usuario (RF-004). */
export interface TrocarSenhaRequest {
  senhaAtual: string;
  novaSenha: string;
}

/** Claims do access token. Nunca contem dado pessoal alem do identificador. */
export interface AccessTokenPayload {
  /** Id do usuario. */
  sub: string;
  perfil: PerfilUsuario;
  /** Id da sessao de refresh que originou este access token. */
  sid: string;
}
