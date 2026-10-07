import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ambiente, type EnvironmentVariables } from './env.validation';

/**
 * Acesso tipado a configuracao. Nenhum segredo e logado ou devolvido ao front-end
 * (RNF-04): esta classe apenas le o ambiente ja validado.
 */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  get ambiente(): Ambiente {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get porta(): number {
    return this.config.get('API_PORT', { infer: true });
  }

  get corsOrigin(): string {
    return this.config.get('CORS_ORIGIN', { infer: true });
  }

  /** Usada apenas para montar o driver adapter do Prisma. Nunca exposta na API. */
  get databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get swaggerHabilitado(): boolean {
    return this.config.get('SWAGGER_ENABLED', { infer: true });
  }

  /** Segredo do access token. Nunca exposto na API nem em log. */
  get jwtAccessSecret(): string {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  /** Segredo do refresh token. Nunca exposto na API nem em log. */
  get jwtRefreshSecret(): string {
    return this.config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  get jwtAccessTtlSegundos(): number {
    return this.config.get('JWT_ACCESS_TTL_SEGUNDOS', { infer: true });
  }

  get jwtRefreshTtlDias(): number {
    return this.config.get('JWT_REFRESH_TTL_DIAS', { infer: true });
  }

  get producao(): boolean {
    return this.ambiente === Ambiente.Production;
  }
}
