import { BreakpointObserver, type BreakpointState } from '@angular/cdk/layout';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, type Observable } from 'rxjs';
import { LayoutPrincipalComponent } from './layout-principal.component';
import { MENU_PRINCIPAL } from './menu-principal';

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

describe('LayoutPrincipalComponent', () => {
  let breakpoints: BreakpointObserverFalso;

  beforeEach(() => {
    breakpoints = new BreakpointObserverFalso();

    TestBed.configureTestingModule({
      imports: [LayoutPrincipalComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: BreakpointObserver, useValue: breakpoints },
      ],
    });
  });

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

  it('mostra um item de menu para cada entrada do menu principal', () => {
    const fixture = TestBed.createComponent(LayoutPrincipalComponent);
    fixture.detectChanges();

    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('a[mat-list-item]');

    expect(links.length).toBe(MENU_PRINCIPAL.length);
  });
});
