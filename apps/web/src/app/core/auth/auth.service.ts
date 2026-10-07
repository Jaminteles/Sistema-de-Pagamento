import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  LoginRequest,
  PerfilUsuario,
  SessaoResponse,
  TrocarSenhaRequest,
  UsuarioAutenticado,
} from '@sistema/shared';
import { catchError, map, type Observable, of, shareReplay, tap } from 'rxjs';

/**
 * Renova o access token um pouco antes de ele vencer, para o usuario nunca
 * tropecar num 401 no meio de um lancamento de ponto.
 */
const FRACAO_PARA_RENOVAR = 0.8;
const MARGEM_MINIMA_SEGUNDOS = 30;

/**
 * Sessao do usuario no front-end (RF-001).
 *
 * O access token fica somente em memoria, num campo privado: nada de
 * localStorage ou sessionStorage, que um XSS leria. O refresh token nunca passa
 * por aqui - ele vive no cookie httpOnly que o navegador envia sozinho para
 * /api/auth.
 *
 * O perfil guardado aqui serve para montar o menu e as rotas. A autorizacao de
 * verdade e sempre a do back-end.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private accessToken: string | null = null;
  private renovacaoAgendada: ReturnType<typeof setTimeout> | null = null;
  /** Renovacao em andamento, compartilhada para nao disparar varias de uma vez. */
  private renovacaoEmCurso: Observable<string | null> | null = null;

  private readonly usuarioAtual = signal<UsuarioAutenticado | null>(null);

  readonly usuario = this.usuarioAtual.asReadonly();
  readonly autenticado = computed(() => this.usuarioAtual() !== null);
  readonly perfil = computed<PerfilUsuario | null>(() => this.usuarioAtual()?.perfil ?? null);

  /** Usado pelo interceptor para anexar o cabecalho Authorization. */
  tokenAtual(): string | null {
    return this.accessToken;
  }

  temAlgumPerfil(perfis: readonly PerfilUsuario[]): boolean {
    const atual = this.usuarioAtual()?.perfil;
    return atual !== undefined && perfis.includes(atual);
  }

  login(credenciais: LoginRequest): Observable<UsuarioAutenticado> {
    return this.http
      .post<SessaoResponse>('auth/login', credenciais, { withCredentials: true })
      .pipe(
        tap((sessao) => this.aplicarSessao(sessao)),
        map((sessao) => sessao.usuario),
      );
  }

  /**
   * Restaura a sessao na abertura da aplicacao.
   *
   * Como o access token morre com o recarregamento da pagina, o cookie de
   * refresh e a unica forma de saber que o usuario continua logado. Falhar aqui
   * e normal (visitante sem sessao) e nao deve virar erro na tela.
   */
  restaurarSessao(): Promise<void> {
    return new Promise((resolver) => {
      this.renovar()
        .pipe(catchError(() => of(null)))
        .subscribe({
          next: () => resolver(),
          error: () => resolver(),
        });
    });
  }

  /**
   * Renova o access token. Chamadas simultaneas aproveitam a mesma requisicao:
   * varias telas tomando 401 juntas nao geram varios refresh.
   */
  renovar(): Observable<string | null> {
    this.renovacaoEmCurso ??= this.http
      .post<SessaoResponse>('auth/refresh', {}, { withCredentials: true })
      .pipe(
        tap((sessao) => this.aplicarSessao(sessao)),
        map((sessao) => sessao.accessToken),
        tap({
          error: () => this.encerrarLocalmente(),
          finalize: () => {
            this.renovacaoEmCurso = null;
          },
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.renovacaoEmCurso;
  }

  /** Encerra a sessao no servidor e limpa o que esta em memoria. */
  logout(): Observable<void> {
    return this.http.post<void>('auth/logout', {}, { withCredentials: true }).pipe(
      catchError(() => of(undefined)),
      tap(() => this.encerrarLocalmente()),
      map(() => undefined),
    );
  }

  /** RF-004: troca da propria senha. O back-end encerra todas as sessoes. */
  trocarSenha(dados: TrocarSenhaRequest): Observable<void> {
    return this.http.patch<void>('auth/senha', dados).pipe(tap(() => this.encerrarLocalmente()));
  }

  /** Esquece a sessao sem chamar a API. Usado quando o refresh falha. */
  encerrarLocalmente(): void {
    this.accessToken = null;
    this.usuarioAtual.set(null);
    this.cancelarRenovacao();
  }

  private aplicarSessao(sessao: SessaoResponse): void {
    this.accessToken = sessao.accessToken;
    this.usuarioAtual.set(sessao.usuario);
    this.agendarRenovacao(sessao.expiraEmSegundos);
  }

  private agendarRenovacao(expiraEmSegundos: number): void {
    this.cancelarRenovacao();

    // Renova a 80% da vida do token e, em token curto, sempre com pelo menos
    // 30 segundos de folga antes do vencimento.
    const segundos = Math.min(
      expiraEmSegundos * FRACAO_PARA_RENOVAR,
      expiraEmSegundos - MARGEM_MINIMA_SEGUNDOS,
    );

    if (!Number.isFinite(segundos) || segundos <= 0) {
      return;
    }

    this.renovacaoAgendada = setTimeout(() => {
      this.renovacaoAgendada = null;
      // Falha silenciosa: o interceptor trata o 401 da proxima requisicao.
      this.renovar()
        .pipe(catchError(() => of(null)))
        .subscribe();
    }, segundos * 1000);
  }

  private cancelarRenovacao(): void {
    if (this.renovacaoAgendada !== null) {
      clearTimeout(this.renovacaoAgendada);
      this.renovacaoAgendada = null;
    }
  }
}
