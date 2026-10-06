import angular from 'angular-eslint';
import { ignores, typescriptConfig } from '../../eslint.config.base.mjs';

// O ESLint 10 nao aceita a chave "extends" dentro do flat config: os conjuntos
// do angular-eslint entram espalhados e com o escopo de arquivo explicito.
const configsTypescript = angular.configs.tsRecommended.map((config) => ({
  ...config,
  files: ['**/*.ts'],
}));

const configsTemplate = [
  ...angular.configs.templateRecommended,
  ...angular.configs.templateAccessibility,
].map((config) => ({ ...config, files: ['**/*.html'] }));

export default [
  { ignores: [...ignores, 'jest.config.ts', 'jest.setup.ts'] },
  ...typescriptConfig(import.meta.dirname),
  ...configsTypescript,
  {
    files: ['**/*.ts'],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      // Toda tela e componente usam OnPush (padrao do projeto).
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      // Token de acesso fica em memoria: nunca em localStorage/sessionStorage.
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Proibido: token de acesso fica em memoria.' },
        { name: 'sessionStorage', message: 'Proibido: token de acesso fica em memoria.' },
      ],
    },
  },
  ...configsTemplate,
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Validators.required e companhia sao funcoes estaticas do Angular:
      // a regra aponta falso positivo ao passa-las como validador.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
];
