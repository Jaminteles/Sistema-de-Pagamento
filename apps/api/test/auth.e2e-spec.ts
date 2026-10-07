import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AcaoAuditoria,
  API_PREFIX,
  type ApiErrorResponse,
  PerfilUsuario,
  type SessaoResponse,
  type UsuarioResponse,
} from '@sistema/shared';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { gerarHashSenha } from '../src/common/crypto/password.util';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { PrismaEmMemoria } from './prisma-em-memoria';

const SENHA = 'senha-de-teste-123';
const COOKIE_REFRESH = 'refresh_token';

/**
 * Testes de autenticacao e de permissao por perfil (T-015).
 *
 * Exercitam o contrato HTTP de verdade - guards globais, cookie de refresh,
 * auditoria e formato de erro - com o banco substituido por um dublê em
 * memoria. Nenhuma conexao real e nenhuma chamada externa.
 */
describe('Autenticacao e permissoes (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let banco: PrismaEmMemoria;

  const ids: Record<string, string> = {};

  /** Set-Cookie vem sem tipo do supertest; normaliza para lista de strings. */
  function setCookie(resposta: request.Response): string[] {
    const cabecalho: unknown = resposta.headers['set-cookie'];
    if (Array.isArray(cabecalho)) {
      return cabecalho.filter((item): item is string => typeof item === 'string');
    }
    return typeof cabecalho === 'string' ? [cabecalho] : [];
  }

  /** Atributos completos do cookie de refresh (HttpOnly, SameSite, Path). */
  function atributosDoCookie(resposta: request.Response): string {
    return setCookie(resposta).find((item) => item.startsWith(`${COOKIE_REFRESH}=`)) ?? '';
  }

  /** Valor do cookie de refresh, ou null quando a resposta nao o define. */
  function cookieDa(resposta: request.Response): string | null {
    const atributos = atributosDoCookie(resposta);
    const valor = atributos.split(';')[0]?.split('=')[1] ?? '';
    return valor.length > 0 ? valor : null;
  }

  async function entrar(
    email: string,
    ip = '203.0.113.1',
  ): Promise<{ token: string; refresh: string }> {
    const resposta = await request(baseUrl)
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, senha: SENHA })
      .expect(200);

    const corpo = resposta.body as SessaoResponse;
    const refresh = cookieDa(resposta);
    if (!refresh) {
      throw new Error('login nao devolveu o cookie de refresh');
    }
    return { token: corpo.accessToken, refresh };
  }

  beforeAll(async () => {
    banco = new PrismaEmMemoria();
    const senhaHash = await gerarHashSenha(SENHA);

    const perfis: [string, PerfilUsuario, boolean][] = [
      ['admin', PerfilUsuario.ADMIN, true],
      ['rh', PerfilUsuario.RH, true],
      ['encarregado', PerfilUsuario.ENCARREGADO, true],
      ['financeiro', PerfilUsuario.FINANCEIRO, true],
      ['inativo', PerfilUsuario.ADMIN, false],
    ];

    for (const [chave, perfil, ativo] of perfis) {
      const criado = (await banco.usuario.create({
        data: {
          nome: `Usuario ${chave}`,
          email: `${chave}@empresa.com.br`,
          senhaHash,
          perfil,
        },
        select: { id: true },
      })) as { id: string };

      if (!ativo) {
        await banco.usuario.update({
          where: { id: criado.id },
          data: { ativo: false },
          select: { id: true },
        });
      }
      ids[chave] = criado.id;
    }

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(banco)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    // Igual ao bootstrap de producao: um salto de proxy confiavel, para o rate
    // limit e a auditoria verem o IP do cliente.
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('login (RF-001)', () => {
    it('autentica e devolve o access token no corpo e o refresh em cookie httpOnly', async () => {
      const resposta = await request(baseUrl)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.1')
        .send({ email: 'admin@empresa.com.br', senha: SENHA })
        .expect(200);

      const corpo = resposta.body as SessaoResponse;
      expect(typeof corpo.accessToken).toBe('string');
      expect(corpo.usuario.perfil).toBe(PerfilUsuario.ADMIN);
      expect(corpo.expiraEmSegundos).toBeGreaterThan(0);

      // O refresh token nunca aparece no corpo.
      expect(JSON.stringify(corpo)).not.toContain(cookieDa(resposta));

      const atributos = atributosDoCookie(resposta);
      expect(atributos).toContain('HttpOnly');
      expect(atributos).toContain('SameSite=Strict');
      expect(atributos).toContain('Path=/api/auth');
    });

    it('audita o login (RF-005) sem gravar senha nem token', () => {
      const logs = banco.logsDaAcao(AcaoAuditoria.LOGIN);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.at(-1)).toMatchObject({ entidade: 'usuario', usuarioId: ids['admin'] });
      expect(JSON.stringify(logs)).not.toContain(SENHA);
    });

    it('recusa senha errada com 401 e sem dizer se o e-mail existe', async () => {
      const resposta = await request(baseUrl)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.2')
        .send({ email: 'admin@empresa.com.br', senha: 'senha-errada-de-teste' })
        .expect(401);

      expect((resposta.body as ApiErrorResponse).message).toBe('E-mail ou senha invalidos.');
    });

    it('recusa usuario desativado', async () => {
      await request(baseUrl)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.3')
        .send({ email: 'inativo@empresa.com.br', senha: SENHA })
        .expect(401);
    });

    it('rejeita campo extra no corpo (mass assignment)', async () => {
      const resposta = await request(baseUrl)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.4')
        .send({ email: 'admin@empresa.com.br', senha: SENHA, perfil: 'ADMIN' })
        .expect(400);

      expect((resposta.body as ApiErrorResponse).statusCode).toBe(400);
    });
  });

  describe('guards globais', () => {
    it('recusa rota protegida sem token (401)', async () => {
      await request(baseUrl).get('/api/usuarios').expect(401);
    });

    it('recusa token com assinatura invalida (401)', async () => {
      await request(baseUrl)
        .get('/api/usuarios')
        .set('Authorization', 'Bearer nao.e.um.token')
        .expect(401);
    });

    it('ignora o esquema errado no cabecalho Authorization (401)', async () => {
      const { token } = await entrar('admin@empresa.com.br', '198.51.100.5');
      await request(baseUrl).get('/api/usuarios').set('Authorization', token).expect(401);
    });

    it('mantem /api/health publico', async () => {
      await request(baseUrl).get('/api/health').expect(200);
    });
  });

  describe('matriz de permissoes (secao 3 do Levantamento de Requisitos)', () => {
    let tokenAdmin: string;
    let tokenRh: string;
    let tokenEncarregado: string;
    let tokenFinanceiro: string;

    beforeAll(async () => {
      tokenAdmin = (await entrar('admin@empresa.com.br', '198.51.100.10')).token;
      tokenRh = (await entrar('rh@empresa.com.br', '198.51.100.11')).token;
      tokenEncarregado = (await entrar('encarregado@empresa.com.br', '198.51.100.12')).token;
      tokenFinanceiro = (await entrar('financeiro@empresa.com.br', '198.51.100.13')).token;
    });

    it('ADMIN lista usuarios', async () => {
      const resposta = await request(baseUrl)
        .get('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const corpo = resposta.body as { itens: UsuarioResponse[]; total: number };
      expect(corpo.total).toBeGreaterThanOrEqual(5);
      expect(JSON.stringify(corpo)).not.toContain('senhaHash');
      expect(JSON.stringify(corpo)).not.toContain('argon2');
    });

    it.each([
      ['RH', (): string => tokenRh],
      ['ENCARREGADO', (): string => tokenEncarregado],
      ['FINANCEIRO', (): string => tokenFinanceiro],
    ])('%s nao gerencia usuarios (403)', async (_perfil, pegarToken) => {
      await request(baseUrl)
        .get('/api/usuarios')
        .set('Authorization', `Bearer ${pegarToken()}`)
        .expect(403);
    });

    it('RH nao cria usuario nem por ID na rota (403)', async () => {
      await request(baseUrl)
        .patch(`/api/usuarios/${ids['rh'] ?? ''}`)
        .set('Authorization', `Bearer ${tokenRh}`)
        .send({ perfil: PerfilUsuario.ADMIN })
        .expect(403);
    });

    it('ENCARREGADO nao redefine senha de outro usuario (403)', async () => {
      await request(baseUrl)
        .post(`/api/usuarios/${ids['admin'] ?? ''}/redefinir-senha`)
        .set('Authorization', `Bearer ${tokenEncarregado}`)
        .send({ novaSenha: 'senha-nova-forte-1' })
        .expect(403);
    });

    it('todo perfil autenticado consulta os proprios dados', async () => {
      for (const token of [tokenAdmin, tokenRh, tokenEncarregado, tokenFinanceiro]) {
        await request(baseUrl).get('/api/auth/eu').set('Authorization', `Bearer ${token}`).expect(200);
      }
    });

    it('ADMIN cria usuario e o novo perfil ja vale na listagem', async () => {
      const criado = await request(baseUrl)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          nome: 'Novo Financeiro',
          email: 'NOVO@empresa.com.br',
          senha: SENHA,
          perfil: PerfilUsuario.FINANCEIRO,
        })
        .expect(201);

      const corpo = criado.body as UsuarioResponse;
      expect(corpo.email).toBe('novo@empresa.com.br');
      expect(corpo).not.toHaveProperty('senha');
      expect(banco.logsDaAcao(AcaoAuditoria.USUARIO_CRIADO).length).toBe(1);
    });

    it('recusa e-mail repetido com 409', async () => {
      await request(baseUrl)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          nome: 'Repetido',
          email: 'novo@empresa.com.br',
          senha: SENHA,
          perfil: PerfilUsuario.RH,
        })
        .expect(409);
    });

    it('recusa senha curta na criacao (400)', async () => {
      const resposta = await request(baseUrl)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          nome: 'Senha Curta',
          email: 'curta@empresa.com.br',
          senha: 'curta',
          perfil: PerfilUsuario.RH,
        })
        .expect(400);

      expect((resposta.body as ApiErrorResponse).details?.join(' ')).toContain('12 caracteres');
    });

    it('rebaixa um administrador quando existe outro ativo', async () => {
      const segundo = await request(baseUrl)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          nome: 'Segundo Admin',
          email: 'admin2@empresa.com.br',
          senha: SENHA,
          perfil: PerfilUsuario.ADMIN,
        })
        .expect(201);

      const idSegundo = (segundo.body as UsuarioResponse).id;

      const alterado = await request(baseUrl)
        .patch(`/api/usuarios/${idSegundo}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ perfil: PerfilUsuario.RH })
        .expect(200);

      expect((alterado.body as UsuarioResponse).perfil).toBe(PerfilUsuario.RH);
      expect(banco.logsDaAcao(AcaoAuditoria.USUARIO_PERFIL_ALTERADO).length).toBe(1);
    });

    it('recusa o admin alterar a propria situacao (400)', async () => {
      await request(baseUrl)
        .patch(`/api/usuarios/${ids['admin'] ?? ''}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ nome: 'Ana Admin', ativo: false })
        .expect(400);
    });

    it('recusa id fora do formato uuid (400)', async () => {
      await request(baseUrl)
        .get('/api/usuarios/nao-e-uuid')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(400);
    });
  });

  describe('rate limit do login', () => {
    it('bloqueia com 429 depois do limite de tentativas no mesmo IP', async () => {
      const ip = '198.51.100.99';
      let ultimoStatus = 0;

      // O limite da rota de sessao e 8 por minuto; a nona tentativa cai.
      for (let tentativa = 1; tentativa <= 9; tentativa += 1) {
        const resposta = await request(baseUrl)
          .post('/api/auth/login')
          .set('X-Forwarded-For', ip)
          .send({ email: 'admin@empresa.com.br', senha: 'senha-errada-de-teste' });
        ultimoStatus = resposta.status;
      }

      expect(ultimoStatus).toBe(429);
    });
  });

  describe('sessao: refresh, rotacao e logout', () => {
    it('renova a sessao pelo cookie e rotaciona o refresh token', async () => {
      const { refresh } = await entrar('rh@empresa.com.br', '198.51.100.20');

      const renovada = await request(baseUrl)
        .post('/api/auth/refresh')
        .set('Cookie', `${COOKIE_REFRESH}=${refresh}`)
        .expect(200);

      const novoRefresh = cookieDa(renovada);
      expect(novoRefresh).toBeTruthy();
      expect(novoRefresh).not.toBe(refresh);
      expect((renovada.body as SessaoResponse).usuario.perfil).toBe(PerfilUsuario.RH);
    });

    it('recusa o refresh token antigo depois da rotacao (401)', async () => {
      const { refresh } = await entrar('financeiro@empresa.com.br', '198.51.100.21');

      await request(baseUrl)
        .post('/api/auth/refresh')
        .set('Cookie', `${COOKIE_REFRESH}=${refresh}`)
        .expect(200);

      await request(baseUrl)
        .post('/api/auth/refresh')
        .set('Cookie', `${COOKIE_REFRESH}=${refresh}`)
        .expect(401);
    });

    it('recusa refresh sem cookie (401)', async () => {
      await request(baseUrl).post('/api/auth/refresh').expect(401);
    });

    it('recusa refresh vindo de outra origem (CSRF, 403)', async () => {
      const { refresh } = await entrar('encarregado@empresa.com.br', '198.51.100.22');

      await request(baseUrl)
        .post('/api/auth/refresh')
        .set('Origin', 'https://site-malicioso.example')
        .set('Cookie', `${COOKIE_REFRESH}=${refresh}`)
        .expect(403);
    });

    it('logout derruba o access token na mesma hora', async () => {
      const { token } = await entrar('rh@empresa.com.br', '198.51.100.23');

      await request(baseUrl).get('/api/auth/eu').set('Authorization', `Bearer ${token}`).expect(200);

      await request(baseUrl)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      await request(baseUrl).get('/api/auth/eu').set('Authorization', `Bearer ${token}`).expect(401);
    });

    it('troca de senha encerra a sessao e audita (RF-004, RF-005)', async () => {
      const email = 'trocasenha@empresa.com.br';
      const { token: tokenAdmin } = await entrar('admin@empresa.com.br', '198.51.100.24');

      await request(baseUrl)
        .post('/api/usuarios')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ nome: 'Troca Senha', email, senha: SENHA, perfil: PerfilUsuario.RH })
        .expect(201);

      const { token } = await entrar(email, '198.51.100.25');
      const antes = banco.logsDaAcao(AcaoAuditoria.SENHA_REDEFINIDA).length;

      await request(baseUrl)
        .patch('/api/auth/senha')
        .set('Authorization', `Bearer ${token}`)
        .send({ senhaAtual: SENHA, novaSenha: 'senha-nova-de-teste-1' })
        .expect(204);

      expect(banco.logsDaAcao(AcaoAuditoria.SENHA_REDEFINIDA).length).toBe(antes + 1);
      await request(baseUrl).get('/api/auth/eu').set('Authorization', `Bearer ${token}`).expect(401);

      // A senha antiga nao serve mais.
      await request(baseUrl)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.26')
        .send({ email, senha: SENHA })
        .expect(401);
    });
  });
});
