import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import type { HttpEvent, HttpHandlerFn } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { type Observable, of, throwError } from 'rxjs';
import { NotificacaoService } from '../notificacao/notificacao.service';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

/** Desfecho da requisicao: o interceptor terminou bem ou repassou um erro. */
type Resultado = { falhou: false } | { falhou: true; erro: unknown };

/** Erro repassado pelo interceptor, ou null quando a requisicao deu certo. */
function erroDe(desfecho: Resultado): unknown {
  return desfecho.falhou ? desfecho.erro : null;
}

/** Dublê do AuthService: so o que o interceptor usa. */
class AuthFalso {
  token: string | null = 'token-1';
  tokenNovo: string | null = 'token-2';
  encerrou = false;
  renovacoes = 0;

  tokenAtual(): string | null {
    return this.token;
  }

  renovar(): Observable<string | null> {
    this.renovacoes += 1;
    return this.tokenNovo === null ? throwError(() => new Error('sem sessao')) : of(this.tokenNovo);
  }

  encerrarLocalmente(): void {
    this.encerrou = true;
    this.token = null;
  }
}

describe('authInterceptor', () => {
  let auth: AuthFalso;
  let navegou: string[][];
  let errosNotificados: string[];

  beforeEach(() => {
    auth = new AuthFalso();
    navegou = [];
    errosNotificados = [];

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        {
          provide: Router,
          useValue: {
            url: '/usuarios',
            navigate: (comandos: string[]) => {
              navegou.push(comandos);
              return Promise.resolve(true);
            },
          },
        },
        {
          provide: NotificacaoService,
          useValue: {
            erro: (mensagem: string) => errosNotificados.push(mensagem),
            sucesso: () => undefined,
          },
        },
      ],
    });
  });

  /** Executa o interceptor registrando as requisicoes que chegaram ao `next`. */
  function executar(
    requisicao: HttpRequest<unknown>,
    respostas: (() => Observable<HttpEvent<unknown>>)[],
  ): { enviadas: HttpRequest<unknown>[]; resultado: Promise<Resultado> } {
    const enviadas: HttpRequest<unknown>[] = [];
    let chamada = 0;

    const next: HttpHandlerFn = (req) => {
      enviadas.push(req);
      const resposta = respostas[Math.min(chamada, respostas.length - 1)];
      chamada += 1;
      return resposta ? resposta() : of(new HttpResponse({ status: 200 }));
    };

    // Resolve sempre: o HttpErrorResponse do Angular nao e um Error, e
    // rejeitar com ele cairia na regra prefer-promise-reject-errors.
    const resultado = new Promise<Resultado>((resolver) => {
      TestBed.runInInjectionContext(() => {
        authInterceptor(requisicao, next).subscribe({
          next: () => resolver({ falhou: false }),
          error: (erro: unknown) => resolver({ falhou: true, erro }),
        });
      });
    });

    return { enviadas, resultado };
  }

  const ok = (): Observable<HttpEvent<unknown>> => of(new HttpResponse({ status: 200 }));
  const naoAutorizado = (): Observable<HttpEvent<unknown>> =>
    throwError(() => new HttpErrorResponse({ status: 401, url: '/api/usuarios' }));
  const proibido = (): Observable<HttpEvent<unknown>> =>
    throwError(() => new HttpErrorResponse({ status: 403, url: '/api/usuarios' }));

  it('anexa o access token nas rotas comuns', async () => {
    const { enviadas, resultado } = executar(new HttpRequest('GET', '/api/usuarios'), [ok]);
    await resultado;

    expect(enviadas[0]?.headers.get('Authorization')).toBe('Bearer token-1');
  });

  it('nao anexa token nas rotas de sessao', async () => {
    const { enviadas, resultado } = executar(
      new HttpRequest('POST', '/api/auth/login', { email: 'a@b.c', senha: 'x' }),
      [ok],
    );
    await resultado;

    expect(enviadas[0]?.headers.has('Authorization')).toBe(false);
  });

  it('nao anexa cabecalho quando nao ha token', async () => {
    auth.token = null;
    const { enviadas, resultado } = executar(new HttpRequest('GET', '/api/usuarios'), [ok]);
    await resultado;

    expect(enviadas[0]?.headers.has('Authorization')).toBe(false);
  });

  it('renova a sessao no 401 e repete a requisicao com o token novo', async () => {
    const { enviadas, resultado } = executar(new HttpRequest('GET', '/api/usuarios'), [
      naoAutorizado,
      ok,
    ]);

    await resultado;

    expect(auth.renovacoes).toBe(1);
    expect(enviadas.length).toBe(2);
    expect(enviadas[1]?.headers.get('Authorization')).toBe('Bearer token-2');
  });

  it('nao tenta renovar quando o 401 vem da propria rota de refresh', async () => {
    const { resultado } = executar(new HttpRequest('POST', '/api/auth/refresh', {}), [
      naoAutorizado,
    ]);

    expect(erroDe(await resultado)).toBeInstanceOf(HttpErrorResponse);
    expect(auth.renovacoes).toBe(0);
  });

  it('encerra a sessao e manda para o login quando a renovacao falha', async () => {
    auth.tokenNovo = null;

    const { resultado } = executar(new HttpRequest('GET', '/api/usuarios'), [naoAutorizado]);

    expect(erroDe(await resultado)).toBeInstanceOf(HttpErrorResponse);
    expect(auth.encerrou).toBe(true);
    expect(navegou[0]).toEqual(['/login']);
  });

  it('avisa o usuario no 403 e nao tenta renovar', async () => {
    const { resultado } = executar(new HttpRequest('GET', '/api/usuarios'), [proibido]);

    expect(erroDe(await resultado)).toBeInstanceOf(HttpErrorResponse);
    expect(errosNotificados).toEqual(['Voce nao tem permissao para esta acao.']);
    expect(auth.renovacoes).toBe(0);
  });

  it('repassa erro que nao e de sessao sem renovar', async () => {
    const erro500 = (): Observable<HttpEvent<unknown>> =>
      throwError(() => new HttpErrorResponse({ status: 500 }));

    const { resultado } = executar(new HttpRequest('GET', '/api/usuarios'), [erro500]);

    expect(erroDe(await resultado)).toBeInstanceOf(HttpErrorResponse);
    expect(auth.renovacoes).toBe(0);
    expect(errosNotificados).toEqual([]);
  });
});
