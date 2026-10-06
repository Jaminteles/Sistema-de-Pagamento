import { Ambiente, validateEnv } from './env.validation';

const ambienteValido = {
  NODE_ENV: 'development',
  API_PORT: '3000',
  DATABASE_URL: 'postgresql://app:senha@localhost:5432/ponto_pagamento?schema=public',
  CORS_ORIGIN: 'http://localhost:4200',
  SWAGGER_ENABLED: 'true',
};

describe('validateEnv', () => {
  it('aceita um ambiente completo e converte os tipos', () => {
    const resultado = validateEnv(ambienteValido);

    expect(resultado.API_PORT).toBe(3000);
    expect(resultado.SWAGGER_ENABLED).toBe(true);
    expect(resultado.NODE_ENV).toBe(Ambiente.Development);
  });

  it('falha quando DATABASE_URL esta ausente', () => {
    const { DATABASE_URL: _ignorado, ...incompleto } = ambienteValido;

    expect(() => validateEnv(incompleto)).toThrow(/DATABASE_URL/);
  });

  it('falha quando CORS_ORIGIN esta ausente (CORS nunca fica aberto por omissao)', () => {
    const { CORS_ORIGIN: _ignorado, ...incompleto } = ambienteValido;

    expect(() => validateEnv(incompleto)).toThrow(/CORS_ORIGIN/);
  });

  it('falha quando a porta esta fora da faixa', () => {
    expect(() => validateEnv({ ...ambienteValido, API_PORT: '70000' })).toThrow(/API_PORT/);
  });

  it('falha quando NODE_ENV nao e um ambiente conhecido', () => {
    expect(() => validateEnv({ ...ambienteValido, NODE_ENV: 'homolog' })).toThrow(/NODE_ENV/);
  });
});
