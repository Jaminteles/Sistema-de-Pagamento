/**
 * Jornada de trabalho (RF-009).
 *
 * Horarios em minutos desde a meia-noite, no fuso de negocio (RNF-12), e
 * duracoes em minutos inteiros - nunca float, nunca string de hora.
 */
export interface JornadaResponse {
  id: string;
  nome: string;
  entradaMinutos: number;
  saidaMinutos: number;
  intervaloMinutos: number;
  cargaSemanalMinutos: number;
  /** RN-02: tolerancia diaria, padrao 10 minutos. */
  toleranciaMinutos: number;
  /** Dias de trabalho em ISO-8601 (1 = segunda ... 7 = domingo), ordenados. */
  diasSemana: number[];
  ativa: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/** POST /api/jornadas (RF-009). */
export interface CriarJornadaRequest {
  nome: string;
  entradaMinutos: number;
  saidaMinutos: number;
  intervaloMinutos: number;
  cargaSemanalMinutos: number;
  toleranciaMinutos?: number;
  diasSemana: number[];
}

/** PATCH /api/jornadas/:id (RF-009). Jornada nao e excluida, e desativada. */
export interface AtualizarJornadaRequest {
  nome?: string;
  entradaMinutos?: number;
  saidaMinutos?: number;
  intervaloMinutos?: number;
  cargaSemanalMinutos?: number;
  toleranciaMinutos?: number;
  diasSemana?: number[];
  ativa?: boolean;
}

/** Filtros de GET /api/jornadas. */
export interface FiltroJornadas {
  busca?: string;
  ativa?: boolean;
}

export const JORNADA_NOME_TAMANHO_MAXIMO = 120;
/** Intervalo intrajornada: ate 8 horas (jornadas com intervalo longo na obra). */
export const JORNADA_INTERVALO_MAXIMO_MINUTOS = 480;
/** RN-02: a tolerancia legal e de 10 minutos; o teto evita cadastro abusivo. */
export const JORNADA_TOLERANCIA_PADRAO_MINUTOS = 10;
export const JORNADA_TOLERANCIA_MAXIMA_MINUTOS = 60;
/** 44 horas semanais (CLT art. 58) com folga para escalas especiais. */
export const JORNADA_CARGA_SEMANAL_MAXIMA_MINUTOS = 3600;
