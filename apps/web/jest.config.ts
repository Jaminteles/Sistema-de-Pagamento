import type { Config } from 'jest';
import { createEsmPreset } from 'jest-preset-angular/presets/index.js';

/**
 * Jest + jest-preset-angular. A stack do projeto usa Jest, nao o runner padrao
 * do Angular CLI. Preset ESM porque o Angular 22 e distribuido apenas como ESM
 * (o script passa --experimental-vm-modules).
 *
 * Execucao serial (--runInBand) para nao sobrecarregar a maquina.
 */
const preset = createEsmPreset();

const config: Config = {
  ...preset,
  rootDir: '.',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    // Resolve o pacote compartilhado pelo dist compilado, o mesmo artefato que
    // a aplicacao consome. O script pretest garante que ele esteja atualizado.
    '^@sistema/shared$': '<rootDir>/../../packages/shared/dist/index.js',
  },
  collectCoverageFrom: ['src/app/**/*.ts', '!src/app/**/*.spec.ts'],
  coverageDirectory: 'coverage',
  clearMocks: true,
};

export default config;
