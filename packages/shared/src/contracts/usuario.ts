import type { PerfilUsuario } from '../enums/perfil-usuario.js';

/** Usuario como a API devolve. Nunca inclui senha ou hash de senha. */
export interface UsuarioResponse {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/** POST /api/usuarios (RF-002). */
export interface CriarUsuarioRequest {
  nome: string;
  email: string;
  senha: string;
  perfil: PerfilUsuario;
}

/**
 * PATCH /api/usuarios/:id (RF-002).
 *
 * O e-mail nao e alteravel: ele identifica o usuario no login e no log de
 * auditoria. A senha tem rota propria (RF-004).
 */
export interface AtualizarUsuarioRequest {
  nome?: string;
  perfil?: PerfilUsuario;
  ativo?: boolean;
}

/** POST /api/usuarios/:id/redefinir-senha - redefinicao pelo admin (RF-004). */
export interface RedefinirSenhaRequest {
  novaSenha: string;
}

/** Filtros de GET /api/usuarios. */
export interface FiltroUsuarios {
  /** Busca por nome ou e-mail. */
  busca?: string;
  perfil?: PerfilUsuario;
  ativo?: boolean;
}

export const USUARIO_NOME_TAMANHO_MAXIMO = 120;
export const USUARIO_EMAIL_TAMANHO_MAXIMO = 160;
