import { HttpRequest } from '@angular/common/http';
import { of } from 'rxjs';
import { apiBaseUrlInterceptor } from './api-base-url.interceptor';

function urlFinal(url: string): string {
  let recebida = '';
  apiBaseUrlInterceptor(new HttpRequest('GET', url), (req) => {
    recebida = req.url;
    return of();
  }).subscribe({ error: () => undefined });
  return recebida;
}

describe('apiBaseUrlInterceptor', () => {
  it('prefixa caminho relativo com /api', () => {
    expect(urlFinal('usuarios')).toBe('/api/usuarios');
  });

  it('prefixa caminho iniciado por barra', () => {
    expect(urlFinal('/usuarios/1')).toBe('/api/usuarios/1');
  });

  it('nao duplica o prefixo', () => {
    expect(urlFinal('/api/usuarios')).toBe('/api/usuarios');
  });

  it('nao altera URL absoluta', () => {
    expect(urlFinal('https://exemplo.com/outro')).toBe('https://exemplo.com/outro');
  });
});
