import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { LOCALE_PADRAO } from '@sistema/shared';
import { routes } from './app.routes';
import { apiBaseUrlInterceptor } from './core/http/api-base-url.interceptor';
import { erroHttpInterceptor } from './core/http/erro-http.interceptor';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: LOCALE_PADRAO },
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(
      withFetch(),
      // A ordem importa: primeiro o prefixo /api, depois o tratamento de erro.
      withInterceptors([apiBaseUrlInterceptor, erroHttpInterceptor]),
    ),
  ],
};
