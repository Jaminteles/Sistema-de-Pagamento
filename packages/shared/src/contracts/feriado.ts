import type { AbrangenciaFeriado } from '../enums/cadastros.js';

/** Feriado do calendario (RF-011). `data` em "AAAA-MM-DD". */
export interface FeriadoResponse {
  id: string;
  data: string;
  descricao: string;
  abrangencia: AbrangenciaFeriado;
  /** Preenchido em feriado estadual e municipal. */
  uf: string | null;
  /** Preenchido somente em feriado municipal. */
  municipio: string | null;
  criadoEm: string;
}

/** POST /api/feriados (RF-011). */
export interface CriarFeriadoRequest {
  data: string;
  descricao: string;
  abrangencia: AbrangenciaFeriado;
  uf?: string | null;
  municipio?: string | null;
}

/** PATCH /api/feriados/:id (RF-011). */
export interface AtualizarFeriadoRequest {
  data?: string;
  descricao?: string;
  abrangencia?: AbrangenciaFeriado;
  uf?: string | null;
  municipio?: string | null;
}

/** Filtros de GET /api/feriados. Sem `ano`, a API usa o ano corrente. */
export interface FiltroFeriados {
  ano?: number;
  abrangencia?: AbrangenciaFeriado;
  busca?: string;
}

/**
 * POST /api/feriados/nacionais - carga inicial dos feriados nacionais do ano
 * (RF-011). Idempotente: o que ja existe na mesma data e descricao e mantido.
 */
export interface CarregarFeriadosNacionaisRequest {
  ano: number;
}

export interface CarregarFeriadosNacionaisResponse {
  ano: number;
  criados: number;
  jaExistentes: number;
  itens: FeriadoResponse[];
}

export const FERIADO_DESCRICAO_TAMANHO_MAXIMO = 160;
export const FERIADO_MUNICIPIO_TAMANHO_MAXIMO = 120;
/** Faixa aceita para o ano do calendario, aqui e nos DTOs do back-end. */
export const FERIADO_ANO_MINIMO = 2000;
export const FERIADO_ANO_MAXIMO = 2100;
