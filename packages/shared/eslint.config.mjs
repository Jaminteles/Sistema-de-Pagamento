import { ignores, typescriptConfig } from '../../eslint.config.base.mjs';

export default [{ ignores }, ...typescriptConfig(import.meta.dirname)];
