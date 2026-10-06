import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum Ambiente {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/** Converte "true"/"false"/"1"/"0" vindos do ambiente em boolean. */
const toBoolean = (): PropertyDecorator =>
  Transform(({ value }) => value === true || value === 'true' || value === '1');

/**
 * Variaveis de ambiente obrigatorias da API.
 * Nada de valor padrao para segredo: faltando, a aplicacao nao sobe.
 */
export class EnvironmentVariables {
  @IsEnum(Ambiente)
  NODE_ENV: Ambiente = Ambiente.Development;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  /** Origem exata do front-end. CORS fica restrito a ela (sem curinga). */
  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN!: string;

  @toBoolean()
  @IsBoolean()
  SWAGGER_ENABLED = true;
}

/** Usada pelo ConfigModule: falha no boot se o ambiente estiver incompleto. */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const instance = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(instance, {
    skipMissingProperties: false,
    whitelist: false,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const detalhes = errors
      .map((erro) => `${erro.property}: ${Object.values(erro.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Variaveis de ambiente invalidas -> ${detalhes}`);
  }

  return instance;
}
