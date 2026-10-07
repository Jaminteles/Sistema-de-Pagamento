import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { PerfilUsuario } from '@sistema/shared';
import { NEVER, type Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PaginaLoginComponent } from './pagina-login.component';

const USUARIO = {
  id: 'u-1',
  nome: 'Maria RH',
  email: 'rh@empresa.com.br',
  perfil: PerfilUsuario.RH,
  obrasIds: [] as string[],
};

describe('PaginaLoginComponent (T-012)', () => {
  let fixture: ComponentFixture<PaginaLoginComponent>;
  let componente: PaginaLoginComponent;
  let tentativas: { email: string; senha: string }[];
  let navegou: string[];
  let resposta: () => Observable<typeof USUARIO>;
  let retorno: string | null;

  beforeEach(async () => {
    tentativas = [];
    navegou = [];
    retorno = null;
    resposta = () => of(USUARIO);

    await TestBed.configureTestingModule({
      imports: [PaginaLoginComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: (credenciais: { email: string; senha: string }) => {
              tentativas.push(credenciais);
              return resposta();
            },
          },
        },
        {
          provide: Router,
          useValue: {
            navigateByUrl: (url: string) => {
              navegou.push(url);
              return Promise.resolve(true);
            },
            routerState: {
              snapshot: { root: { queryParamMap: { get: (): string | null => retorno } } },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginaLoginComponent);
    componente = fixture.componentInstance;
    await fixture.whenStable();
  });

  function preencher(email: string, senha: string): void {
    componente.form.setValue({ email, senha });
  }

  it('nao envia formulario vazio', () => {
    componente.entrar();
    expect(tentativas).toEqual([]);
    expect(componente.form.controls.email.touched).toBe(true);
  });

  it('nao envia e-mail fora do formato', () => {
    preencher('nao-e-email', 'senha-de-teste-123');
    componente.entrar();
    expect(tentativas).toEqual([]);
  });

  it('envia as credenciais e vai para a tela inicial', async () => {
    preencher('rh@empresa.com.br', 'senha-de-teste-123');
    componente.entrar();
    await fixture.whenStable();

    expect(tentativas).toEqual([{ email: 'rh@empresa.com.br', senha: 'senha-de-teste-123' }]);
    expect(navegou).toEqual(['/inicio']);
  });

  it('volta para a rota que exigiu login', async () => {
    retorno = '/usuarios/novo';
    preencher('rh@empresa.com.br', 'senha-de-teste-123');
    componente.entrar();
    await fixture.whenStable();

    expect(navegou).toEqual(['/usuarios/novo']);
  });

  it('ignora retorno com URL absoluta (redirecionamento aberto)', async () => {
    retorno = 'https://site-malicioso.example/phishing';
    preencher('rh@empresa.com.br', 'senha-de-teste-123');
    componente.entrar();
    await fixture.whenStable();

    expect(navegou).toEqual(['/inicio']);
  });

  it('ignora retorno comecando com // (host externo)', async () => {
    retorno = '//site-malicioso.example';
    preencher('rh@empresa.com.br', 'senha-de-teste-123');
    componente.entrar();
    await fixture.whenStable();

    expect(navegou).toEqual(['/inicio']);
  });

  it('mostra a mensagem da API e limpa a senha quando o login falha', async () => {
    resposta = () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: { statusCode: 401, message: 'E-mail ou senha invalidos.' },
          }),
      );

    preencher('rh@empresa.com.br', 'senha-errada-de-teste');
    componente.entrar();
    await fixture.whenStable();

    expect(componente.erro()).toBe('E-mail ou senha invalidos.');
    expect(componente.form.controls.senha.value).toBeNull();
    expect(componente.enviando()).toBe(false);
    expect(navegou).toEqual([]);
  });

  it('nao reenvia enquanto a requisicao anterior nao termina', () => {
    // Requisicao que nunca responde: o botao precisa continuar travado.
    resposta = () => NEVER;

    preencher('rh@empresa.com.br', 'senha-de-teste-123');
    componente.entrar();
    componente.entrar();

    expect(tentativas.length).toBe(1);
  });
});
