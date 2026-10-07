import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  Router,
  type RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { type PerfilUsuario, PerfilUsuario as Perfis } from '@sistema/shared';
import { NotificacaoService } from '../notificacao/notificacao.service';
import {
  autenticadoGuard,
  perfilGuard,
  PERFIS_DA_ROTA,
  visitanteGuard,
} from './auth.guards';
import { AuthService } from './auth.service';

describe('guards de rota (T-013)', () => {
  const perfilAtual = signal<PerfilUsuario | null>(null);
  let errosNotificados: string[];
  let router: Router;

  const authFalso = {
    perfil: perfilAtual,
    autenticado: (): boolean => perfilAtual() !== null,
    temAlgumPerfil: (permitidos: readonly PerfilUsuario[]): boolean => {
      const atual = perfilAtual();
      return atual !== null && permitidos.includes(atual);
    },
  };

  beforeEach(() => {
    perfilAtual.set(null);
    errosNotificados = [];

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authFalso },
        {
          provide: NotificacaoService,
          useValue: {
            erro: (mensagem: string) => errosNotificados.push(mensagem),
            sucesso: () => undefined,
          },
        },
      ],
    });

    router = TestBed.inject(Router);
  });

  function rotaComPerfis(perfis?: readonly PerfilUsuario[]): ActivatedRouteSnapshot {
    return {
      data: perfis === undefined ? {} : { [PERFIS_DA_ROTA]: perfis },
    } as unknown as ActivatedRouteSnapshot;
  }

  const estado = (url: string): RouterStateSnapshot => ({ url }) as RouterStateSnapshot;

  describe('autenticadoGuard', () => {
    it('libera quem tem sessao', () => {
      perfilAtual.set(Perfis.RH);

      const resultado = TestBed.runInInjectionContext(() =>
        autenticadoGuard(rotaComPerfis(), estado('/usuarios')),
      );

      expect(resultado).toBe(true);
    });

    it('manda para o login guardando a rota de origem', () => {
      const resultado = TestBed.runInInjectionContext(() =>
        autenticadoGuard(rotaComPerfis(), estado('/usuarios/novo')),
      );

      expect(resultado).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(resultado as UrlTree)).toBe(
        '/login?retorno=%2Fusuarios%2Fnovo',
      );
    });
  });

  describe('visitanteGuard', () => {
    it('libera a tela de login para quem nao tem sessao', () => {
      expect(TestBed.runInInjectionContext(() => visitanteGuard(rotaComPerfis(), estado('/login')))).toBe(
        true,
      );
    });

    it('tira de la quem ja esta logado', () => {
      perfilAtual.set(Perfis.ADMIN);

      const resultado = TestBed.runInInjectionContext(() =>
        visitanteGuard(rotaComPerfis(), estado('/login')),
      );

      expect(router.serializeUrl(resultado as UrlTree)).toBe('/inicio');
    });
  });

  describe('perfilGuard', () => {
    it('libera o perfil declarado na rota', () => {
      perfilAtual.set(Perfis.ADMIN);

      const resultado = TestBed.runInInjectionContext(() =>
        perfilGuard(rotaComPerfis([Perfis.ADMIN]), estado('/usuarios')),
      );

      expect(resultado).toBe(true);
    });

    it.each([
      ['RH', Perfis.RH],
      ['ENCARREGADO', Perfis.ENCARREGADO],
      ['FINANCEIRO', Perfis.FINANCEIRO],
    ])('desvia %s da rota exclusiva do ADMIN e avisa', (_nome, perfil) => {
      perfilAtual.set(perfil);

      const resultado = TestBed.runInInjectionContext(() =>
        perfilGuard(rotaComPerfis([Perfis.ADMIN]), estado('/usuarios')),
      );

      expect(router.serializeUrl(resultado as UrlTree)).toBe('/inicio');
      expect(errosNotificados.length).toBe(1);
    });

    it('libera rota sem perfis declarados para qualquer usuario autenticado', () => {
      perfilAtual.set(Perfis.ENCARREGADO);

      expect(
        TestBed.runInInjectionContext(() => perfilGuard(rotaComPerfis(), estado('/inicio'))),
      ).toBe(true);
      expect(errosNotificados).toEqual([]);
    });
  });
});
