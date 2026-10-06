/** Resposta de GET /api/health. Nao expoe versao de dependencia nem dado de infra. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  /** Conectividade com o PostgreSQL. */
  database: 'up' | 'down';
  /** Momento da verificacao em ISO-8601 (UTC). */
  timestamp: string;
}
