import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PerfilUsuario, type SessaoResponse } from '@sistema/shared';
import { AuthService } from './auth.service';

const SESSAO: SessaoResponse = {
  accessToken: 'token-1',
  expiraEmSegundos: 900,
  usuario: {
    id: 'u-1',
    nome: 'Maria RH',
    email: 'rh@empresa.com.br',
    perfil: PerfilUsuario.RH,
    obrasIds: [],
  },
};

describe('AuthService', () => {
  let servico: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    jest.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AuthService],
    });
    servico = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function responderLogin(): TestRequest {
    const requisicao = http.expectOne('auth/login');
    requisicao.flush(SESSAO);
    return requisicao;
  }

  it('comeca sem sessao', () => {
    expect(servico.autenticado()).toBe(false);
    expect(servico.usuario()).toBeNull();
    expect(servico.tokenAtual()).toBeNull();
  });

  it('guarda o token em memoria apos o login, nunca no navegador', () => {
    servico.login({ email: 'rh@empresa.com.br', senha: 'senha-de-teste-123' }).subscribe();
    responderLogin();

    expect(servico.tokenAtual()).toBe('token-1');
    expect(servico.autenticado()).toBe(true);
    expect(servico.usuario()?.perfil).toBe(PerfilUsuario.RH);

    // Que o token nao vai para localStorage/sessionStorage e garantido
    // estaticamente pela regra no-restricted-globals do ESLint do projeto.
  });

  it('envia credenciais para o cookie httpOnly poder voltar', () => {
    servico.login({ email: 'rh@empresa.com.br', senha: 'senha-de-teste-123' }).subscribe();
    const requisicao = responderLogin();

    expect(requisicao.request.withCredentials).toBe(true);
  });

  it('agenda a renovacao antes de o token vencer', () => {
    servico.login({ email: 'rh@empresa.com.br', senha: 'senha-de-teste-123' }).subscribe();
    responderLogin();

    // 80% de 900s = 720s. Antes disso nada acontece.
    jest.advanceTimersByTime(719_000);
    http.expectNone('auth/refresh');

    jest.advanceTimersByTime(2_000);
    http.expectOne('auth/refresh').flush({ ...SESSAO, accessToken: 'token-2' });

    expect(servico.tokenAtual()).toBe('token-2');
  });

  it('nao dispara varios refresh simultaneos', () => {
    servico.renovar().subscribe();
    servico.renovar().subscribe();
    servico.renovar().subscribe();

    const requisicoes = http.match('auth/refresh');
    expect(requisicoes.length).toBe(1);
    requisicoes[0]?.flush(SESSAO);
  });

  it('esquece a sessao quando o refresh falha', () => {
    servico.login({ email: 'rh@empresa.com.br', senha: 'senha-de-teste-123' }).subscribe();
    responderLogin();

    servico.renovar().subscribe({ error: () => undefined });
    http.expectOne('auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(servico.autenticado()).toBe(false);
    expect(servico.tokenAtual()).toBeNull();
  });

  it('restaurarSessao resolve mesmo sem cookie valido', async () => {
    const promessa = servico.restaurarSessao();
    http.expectOne('auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(promessa).resolves.toBeUndefined();
    expect(servico.autenticado()).toBe(false);
  });

  it('restaurarSessao recupera a sessao quando o cookie vale', async () => {
    const promessa = servico.restaurarSessao();
    http.expectOne('auth/refresh').flush(SESSAO);

    await promessa;
    expect(servico.autenticado()).toBe(true);
    expect(servico.usuario()?.id).toBe('u-1');
  });

  it('logout limpa a sessao e cancela a renovacao agendada', () => {
    servico.login({ email: 'rh@empresa.com.br', senha: 'senha-de-teste-123' }).subscribe();
    responderLogin();

    servico.logout().subscribe();
    http.expectOne('auth/logout').flush(null);

    expect(servico.autenticado()).toBe(false);
    expect(servico.tokenAtual()).toBeNull();

    // A renovacao agendada nao deve mais acontecer.
    jest.advanceTimersByTime(900_000);
    http.expectNone('auth/refresh');
  });

  it('logout limpa a sessao mesmo se a API falhar', () => {
    servico.login({ email: 'rh@empresa.com.br', senha: 'senha-de-teste-123' }).subscribe();
    responderLogin();

    servico.logout().subscribe();
    http.expectOne('auth/logout').flush(null, { status: 500, statusText: 'Erro' });

    expect(servico.autenticado()).toBe(false);
  });

  it('trocar a propria senha encerra a sessao local', () => {
    servico.login({ email: 'rh@empresa.com.br', senha: 'senha-de-teste-123' }).subscribe();
    responderLogin();

    servico
      .trocarSenha({ senhaAtual: 'senha-de-teste-123', novaSenha: 'senha-nova-de-teste-1' })
      .subscribe();
    http.expectOne('auth/senha').flush(null);

    expect(servico.autenticado()).toBe(false);
  });

  it('temAlgumPerfil responde pelo perfil da sessao', () => {
    expect(servico.temAlgumPerfil([PerfilUsuario.RH])).toBe(false);

    servico.login({ email: 'rh@empresa.com.br', senha: 'senha-de-teste-123' }).subscribe();
    responderLogin();

    expect(servico.temAlgumPerfil([PerfilUsuario.RH, PerfilUsuario.ADMIN])).toBe(true);
    expect(servico.temAlgumPerfil([PerfilUsuario.ADMIN])).toBe(false);
  });
});
