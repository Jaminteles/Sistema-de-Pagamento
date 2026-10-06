import type { Config } from 'jest';

/**
 * Execucao serial por padrao (--runInBand nos scripts) para nao sobrecarregar a
 * maquina. O flag --experimental-vm-modules e necessario porque o NestJS 12 e
 * distribuido apenas como ESM.
 */
const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    // Resolve o pacote compartilhado pelo dist compilado, o mesmo artefato que
    // a aplicacao consome. O script pretest garante que ele esteja atualizado.
    '^@sistema/shared$': '<rootDir>/../../packages/shared/dist/index.js',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts', '!src/generated/**'],
  coverageDirectory: 'coverage',
  clearMocks: true,
};

export default config;
