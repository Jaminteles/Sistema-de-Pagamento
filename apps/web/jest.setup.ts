import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

// O app roda sem zone.js (padrao do Angular 22).
setupZonelessTestEnv();
