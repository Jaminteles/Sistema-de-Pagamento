import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinLength,
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

  /** Segredo de assinatura do access token (RNF-03). Sem padrao: faltando, nao sobe. */
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  /** Segredo de assinatura do refresh token. Precisa ser diferente do de acesso. */
  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  /** Access token de curta duracao (RNF-03): 5 a 60 minutos. */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(300)
  @Max(3600)
  JWT_ACCESS_TTL_SEGUNDOS = 900;

  /** Validade do refresh token em dias. */
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(30)
  JWT_REFRESH_TTL_DIAS = 7;

  /**
   * Chave da criptografia em repouso da chave Pix e da conta do funcionario
   * (RNF-04): 32 bytes em base64. Sem padrao: faltando, a aplicacao nao sobe.
   */
  @IsString()
  @IsNotEmpty()
  DADOS_PAGAMENTO_CHAVE!: string;
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

  // Depois da validacao campo a campo: faltando um segredo, o erro util e o de
  // variavel ausente, nao o de segredos iguais.
  if (instance.JWT_ACCESS_SECRET === instance.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET precisam ser diferentes.');
  }

  // AES-256 exige exatamente 32 bytes. Falhar aqui evita descobrir a chave
  // errada apenas na primeira gravacao de dado de pagamento.
  if (Buffer.from(instance.DADOS_PAGAMENTO_CHAVE, 'base64').length !== 32) {
    throw new Error('DADOS_PAGAMENTO_CHAVE precisa ter 32 bytes em base64.');
  }

  return instance;
}
