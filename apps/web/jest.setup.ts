import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';
import { jest } from '@jest/globals';

// O app roda sem zone.js (padrao do Angular 22).
setupZonelessTestEnv();

// O preset ESM do Jest nao injeta o objeto `jest` como global. Os specs usam a
// tipagem de @types/jest (tsconfig.spec.json), por isso basta expo-lo aqui -
// assim nenhum spec precisa importar @jest/globals.
(globalThis as unknown as { jest: unknown }).jest = jest;
