import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PerfilUsuario, type UsuarioAutenticado } from '@sistema/shared';
import { BehaviorSubject, type Observable, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LayoutPrincipalComponent } from './layout-principal.component';
import { menuDoPerfil } from './menu-principal';

/** Dublê do BreakpointObserver: permite alternar entre celular e desktop. */
class BreakpointObserverFalso {
  readonly estado = new BehaviorSubject<BreakpointState>({ matches: false, breakpoints: {} });

  observe(): Observable<BreakpointState> {
    return this.estado.asObservable();
  }

  celular(ativo: boolean): void {
    this.estado.next({ matches: ativo, breakpoints: {} });
  }
}

function usuarioCom(perfil: PerfilUsuario): UsuarioAutenticado {
  return {
    id: 'u-1',
    nome: 'Usuario de Teste',
    email: 'teste@empresa.com.br',
    perfil,
    obrasIds: [],
  };
}

describe('LayoutPrincipalComponent', () => {
  let breakpoints: BreakpointObserverFalso;
  let usuario: ReturnType<typeof signal<UsuarioAutenticado | null>>;
  let logouts: number;

  beforeEach(() => {
    breakpoints = new BreakpointObserverFalso();
    usuario = signal<UsuarioAutenticado | null>(usuarioCom(PerfilUsuario.ADMIN));
    logouts = 0;

    const authFalso = {
      usuario,
      perfil: signal<PerfilUsuario | null>(PerfilUsuario.ADMIN),
      logout: (): Observable<void> => {
        logouts += 1;
        return of(undefined);
      },
    };

    TestBed.configureTestingModule({
      imports: [LayoutPrincipalComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: BreakpointObserver, useValue: breakpoints },
        { provide: AuthService, useValue: authFalso },
      ],
    });
  });

  /** Troca o perfil da sessao antes de criar o componente. */
  function comPerfil(perfil: PerfilUsuario | null): void {
    const auth = TestBed.inject(AuthService) as unknown as {
      perfil: ReturnType<typeof signal<PerfilUsuario | null>>;
    };
    auth.perfil.set(perfil);
    usuario.set(perfil === null ? null : usuarioCom(perfil));
  }

  it('no desktop deixa o menu fixo e sempre aberto', () => {
    const fixture = TestBed.createComponent(LayoutPrincipalComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.modo()).toBe('side');
    expect(fixture.componentInstance.aberta()).toBe(true);
  });

  it('no celular o menu vira gaveta sobreposta e comeca fechada (RNF-01)', () => {
    const fixture = TestBed.createComponent(LayoutPrincipalComponent);
    breakpoints.celular(true);
    fixture.detectChanges();

    expect(fixture.componentInstance.modo()).toBe('over');
    expect(fixture.componentInstance.aberta()).toBe(false);
  });

  it('no celular abre e fecha a gaveta pelo botao do cabecalho', () => {
    const fixture = TestBed.createComponent(LayoutPrincipalComponent);
    breakpoints.celular(true);
    fixture.detectChanges();

    fixture.componentInstance.alternarMenu();
    expect(fixture.componentInstance.aberta()).toBe(true);

    fixture.componentInstance.fecharSeCelular();
    expect(fixture.componentInstance.aberta()).toBe(false);
  });

  it('no desktop navegar nao fecha o menu', () => {
    const fixture = TestBed.createComponent(LayoutPrincipalComponent);
    fixture.detectChanges();

    fixture.componentInstance.fecharSeCelular();

    expect(fixture.componentInstance.aberta()).toBe(true);
  });

  it.each([
    ['ADMIN', PerfilUsuario.ADMIN],
    ['RH', PerfilUsuario.RH],
    ['ENCARREGADO', PerfilUsuario.ENCARREGADO],
    ['FINANCEIRO', PerfilUsuario.FINANCEIRO],
  ])('mostra apenas os itens de menu do perfil %s (T-013)', (_nome, perfil) => {
    comPerfil(perfil);

    const fixture = TestBed.createComponent(LayoutPrincipalComponent);
    fixture.detectChanges();

    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('a[mat-list-item]');

    expect(links.length).toBe(menuDoPerfil(perfil).length);
  });

  it('nao mostra Usuarios para quem nao e ADMIN', () => {
    comPerfil(PerfilUsuario.ENCARREGADO);

    const fixture = TestBed.createComponent(LayoutPrincipalComponent);
    fixture.detectChanges();

    const rotas = [...(fixture.nativeElement as HTMLElement).querySelectorAll('a[mat-list-item]')]
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => href !== null);

    expect(rotas).not.toContain('/usuarios');
  });

  it('sair encerra a sessao e volta para o login', async () => {
    const fixture = TestBed.createComponent(LayoutPrincipalComponent);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navegou: string[] = [];
    jest.spyOn(router, 'navigate').mockImplementation((comandos: unknown[]) => {
      navegou.push(String(comandos[0]));
      return Promise.resolve(true);
    });

    fixture.componentInstance.sair();
    await fixture.whenStable();

    expect(logouts).toBe(1);
    expect(navegou).toEqual(['/login']);
  });
});
