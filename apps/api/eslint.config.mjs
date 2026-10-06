import { ignores, typescriptConfig } from '../../eslint.config.base.mjs';

export default [
  { ignores: [...ignores, 'src/generated/**'] },
  ...typescriptConfig(import.meta.dirname),
];
