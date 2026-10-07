import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { LOCALE_PADRAO } from '@sistema/shared';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
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
      // A ordem importa: primeiro o prefixo /api, depois a sessao (que precisa
      // poder repetir a requisicao apos renovar o token) e, por fim, o
      // tratamento de erro da tela.
      withInterceptors([apiBaseUrlInterceptor, authInterceptor, erroHttpInterceptor]),
    ),
    // O access token morre com o recarregamento da pagina; o cookie httpOnly de
    // refresh nao. Tentar restaurar a sessao antes de o roteador rodar evita
    // mandar para o login quem ainda esta logado (T-012).
    provideAppInitializer(() => inject(AuthService).restaurarSessao()),
  ],
};
