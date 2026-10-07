import { Ambiente, validateEnv } from './env.validation';

const ambienteValido = {
  NODE_ENV: 'development',
  API_PORT: '3000',
  DATABASE_URL: 'postgresql://app:senha@localhost:5432/ponto_pagamento?schema=public',
  CORS_ORIGIN: 'http://localhost:4200',
  SWAGGER_ENABLED: 'true',
  // Segredos de teste, sem relacao com qualquer ambiente real.
  JWT_ACCESS_SECRET: 'segredo-de-teste-para-access-token-0001',
  JWT_REFRESH_SECRET: 'segredo-de-teste-para-refresh-token-002',
  JWT_ACCESS_TTL_SEGUNDOS: '900',
  JWT_REFRESH_TTL_DIAS: '7',
};

describe('validateEnv', () => {
  it('aceita um ambiente completo e converte os tipos', () => {
    const resultado = validateEnv(ambienteValido);

    expect(resultado.API_PORT).toBe(3000);
    expect(resultado.SWAGGER_ENABLED).toBe(true);
    expect(resultado.NODE_ENV).toBe(Ambiente.Development);
    expect(resultado.JWT_ACCESS_TTL_SEGUNDOS).toBe(900);
    expect(resultado.JWT_REFRESH_TTL_DIAS).toBe(7);
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

  it('falha quando JWT_ACCESS_SECRET esta ausente (sem padrao para segredo)', () => {
    const { JWT_ACCESS_SECRET: _ignorado, ...incompleto } = ambienteValido;

    expect(() => validateEnv(incompleto)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('falha quando um segredo e curto demais', () => {
    expect(() => validateEnv({ ...ambienteValido, JWT_REFRESH_SECRET: 'curto' })).toThrow(
      /JWT_REFRESH_SECRET/,
    );
  });

  it('exige segredos diferentes para acesso e refresh', () => {
    const mesmo = 'o-mesmo-segredo-para-os-dois-tokens-0001';

    expect(() =>
      validateEnv({ ...ambienteValido, JWT_ACCESS_SECRET: mesmo, JWT_REFRESH_SECRET: mesmo }),
    ).toThrow(/precisam ser diferentes/);
  });

  it('recusa access token de vida longa (RNF-03)', () => {
    expect(() => validateEnv({ ...ambienteValido, JWT_ACCESS_TTL_SEGUNDOS: '86400' })).toThrow(
      /JWT_ACCESS_TTL_SEGUNDOS/,
    );
  });
});
