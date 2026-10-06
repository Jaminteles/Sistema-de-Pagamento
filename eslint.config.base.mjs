// Configuracao ESLint compartilhada pelo monorepo.
// Cada pacote tem seu proprio eslint.config.mjs que importa daqui.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

/** Arquivos e pastas ignorados em todos os pacotes. */
export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.angular/**',
  '**/prisma/migrations/**',
  '**/*.config.js',
  '**/*.config.mjs',
];

/**
 * Regras de TypeScript comuns a api, web e shared.
 *
 * Escopo fixo em **\/*.ts: no front-end o angular-eslint cria arquivos virtuais
 * de template, e as regras com informacao de tipo nao valem para eles.
 *
 * @param {string} tsconfigRootDir diretorio do pacote (import.meta.dirname)
 */
export function typescriptConfig(tsconfigRootDir) {
  return tseslint.config(
    {
      files: ['**/*.ts'],
      extends: [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        // Dinheiro e horas nunca podem virar number por acidente: exigimos tipos explicitos.
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/explicit-member-accessibility': [
          'error',
          { accessibility: 'no-public' },
        ],
        'no-console': ['error', { allow: ['warn', 'error'] }],
        eqeqeq: ['error', 'always'],
        'no-restricted-globals': [
          'error',
          { name: 'parseFloat', message: 'Valores monetarios nao usam float. Use Decimal/string.' },
        ],
      },
    },
    prettierConfig,
  );
}

export { tseslint, eslint, prettierConfig };
