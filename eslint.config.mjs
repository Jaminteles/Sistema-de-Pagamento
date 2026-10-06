// Config raiz: cobre apenas arquivos soltos na raiz do monorepo.
// api, web e shared tem configs proprias (rodadas via pnpm --filter <pkg> lint).
import { ignores } from './eslint.config.base.mjs';

export default [{ ignores: [...ignores, 'apps/**', 'packages/**'] }];
