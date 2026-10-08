/** Obra ou setor como a API devolve (RF-008). */
export interface ObraResponse {
  id: string;
  nome: string;
  endereco: string | null;
  ativa: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/** POST /api/obras (RF-008). Obra nova nasce ativa. */
export interface CriarObraRequest {
  nome: string;
  endereco?: string | null;
}

/**
 * PATCH /api/obras/:id (RF-008).
 *
 * Obra nao e excluida: `ativa: false` a tira das novas operacoes sem apagar o
 * historico de ponto e de pagamento ligado a ela.
 */
export interface AtualizarObraRequest {
  nome?: string;
  endereco?: string | null;
  ativa?: boolean;
}

/** Filtros de GET /api/obras. */
export interface FiltroObras {
  /** Busca por nome ou endereco. */
  busca?: string;
  ativa?: boolean;
}

/** Encarregado vinculado a uma obra (RF-003). */
export interface EncarregadoObraResponse {
  usuarioId: string;
  nome: string;
  email: string;
  ativo: boolean;
}

/**
 * PUT /api/obras/:id/encarregados (RF-003).
 *
 * Substitui a lista inteira. Vincular encarregado define o que ele passa a ver
 * (RN-05), por isso e acao de administrador e fica no log de auditoria.
 */
export interface DefinirEncarregadosRequest {
  usuariosIds: string[];
}

export const OBRA_NOME_TAMANHO_MAXIMO = 160;
export const OBRA_ENDERECO_TAMANHO_MAXIMO = 255;
/** Teto defensivo do corpo de PUT /api/obras/:id/encarregados. */
export const OBRA_ENCARREGADOS_MAXIMO = 50;
