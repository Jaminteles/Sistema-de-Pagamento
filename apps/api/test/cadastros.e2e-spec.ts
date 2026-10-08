import { randomUUID } from 'node:crypto';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AbrangenciaFeriado,
  AcaoAuditoria,
  API_PREFIX,
  type EncarregadoObraResponse,
  type FeriadoResponse,
  type JornadaResponse,
  type ObraResponse,
  PerfilUsuario,
  type RespostaPaginada,
  type SessaoResponse,
} from '@sistema/shared';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { gerarHashSenha } from '../src/common/crypto/password.util';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { FeriadosRepository } from '../src/feriados/feriados.repository';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { JornadasRepository } from '../src/jornadas/jornadas.repository';
import { ObrasRepository } from '../src/obras/obras.repository';
import { PrismaEmMemoria } from './prisma-em-memoria';
import {
  FeriadosRepositorioEmMemoria,
  JornadasRepositorioEmMemoria,
  ObrasRepositorioEmMemoria,
} from './repositorios-em-memoria';

const SENHA = 'senha-de-teste-123';

const OBRA_CENTRO = '019a0000-0000-7000-8000-00000000c001';
const OBRA_LITORAL = '019a0000-0000-7000-8000-00000000c002';

/**
 * Testes de CRUD dos cadastros e do filtro por obra (T-023).
 *
 * Exercitam o contrato HTTP de verdade: guard de JWT, guard de perfil pela
 * matriz da secao 3 do Levantamento de Requisitos, DTOs com whitelist e o
 * escopo do encarregado (RN-05). Os repositorios sao dubles em memoria -
 * nenhuma conexao real e nenhuma chamada externa.
 */
describe('Cadastros: obras, jornadas e feriados (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let banco: PrismaEmMemoria;
  let obras: ObrasRepositorioEmMemoria;
  let jornadas: JornadasRepositorioEmMemoria;
  let feriados: FeriadosRepositorioEmMemoria;

  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  async function entrar(chave: string): Promise<string> {
    const resposta = await request(baseUrl)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ email: `${chave}@empresa.com.br`, senha: SENHA })
      .expect(200);

    return (resposta.body as SessaoResponse).accessToken;
  }

  beforeAll(async () => {
    banco = new PrismaEmMemoria();
    obras = new ObrasRepositorioEmMemoria();
    jornadas = new JornadasRepositorioEmMemoria();
    feriados = new FeriadosRepositorioEmMemoria();

    const senhaHash = await gerarHashSenha(SENHA);

    const perfis: [string, PerfilUsuario][] = [
      ['admin', PerfilUsuario.ADMIN],
      ['rh', PerfilUsuario.RH],
      ['encarregado', PerfilUsuario.ENCARREGADO],
      ['encarregado2', PerfilUsuario.ENCARREGADO],
      ['financeiro', PerfilUsuario.FINANCEIRO],
    ];

    for (const [chave, perfil] of perfis) {
      const criado = (await banco.usuario.create({
        data: {
          nome: `Usuario ${chave}`,
          email: `${chave}@empresa.com.br`,
          senhaHash,
          perfil,
        },
        select: { id: true },
      })) as { id: string };
      ids[chave] = criado.id;
    }

    obras.encarregados.add(ids['encarregado'] as string);
    obras.encarregados.add(ids['encarregado2'] as string);

    obras.semear({ id: OBRA_CENTRO, nome: 'Obra Centro', endereco: 'Rua A, 100' });
    obras.semear({ id: OBRA_LITORAL, nome: 'Obra Litoral' });
    obras.vincular(ids['encarregado'] as string, OBRA_CENTRO);

    jornadas.semear({
      id: '019a0000-0000-7000-8000-00000000d001',
      nome: 'Comercial',
      entradaMinutos: 420,
      saidaMinutos: 1020,
      intervaloMinutos: 60,
      cargaSemanalMinutos: 2640,
      toleranciaMinutos: 10,
      diasSemana: [1, 2, 3, 4, 5],
    });

    feriados.semear({
      id: '019a0000-0000-7000-8000-00000000e001',
      data: new Date('2027-12-25T00:00:00.000Z'),
      descricao: 'Natal',
      abrangencia: AbrangenciaFeriado.NACIONAL,
      uf: null,
      municipio: null,
    });

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(banco)
      .overrideProvider(ObrasRepository)
      .useValue(obras)
      .overrideProvider(JornadasRepository)
      .useValue(jornadas)
      .overrideProvider(FeriadosRepository)
      .useValue(feriados)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.listen(0);
    baseUrl = await app.getUrl();

    for (const [chave] of perfis) {
      tokens[chave] = await entrar(chave);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('obras: permissao por perfil (RF-008)', () => {
    it('exige sessao autenticada', async () => {
      await request(baseUrl).get('/api/obras').expect(401);
    });

    it('permite ADMIN, RH, FINANCEIRO e ENCARREGADO consultarem', async () => {
      for (const chave of ['admin', 'rh', 'financeiro', 'encarregado']) {
        await request(baseUrl)
          .get('/api/obras')
          .set('Authorization', `Bearer ${tokens[chave]}`)
          .expect(200);
      }
    });

    it('recusa cadastro para ENCARREGADO e FINANCEIRO', async () => {
      for (const chave of ['encarregado', 'financeiro']) {
        await request(baseUrl)
          .post('/api/obras')
          .set('Authorization', `Bearer ${tokens[chave]}`)
          .send({ nome: 'Obra proibida' })
          .expect(403);
      }

      expect(obras.obras.some((item) => item.nome === 'Obra proibida')).toBe(false);
    });

    it('recusa alteracao para ENCARREGADO', async () => {
      await request(baseUrl)
        .patch(`/api/obras/${OBRA_CENTRO}`)
        .set('Authorization', `Bearer ${tokens['encarregado']}`)
        .send({ ativa: false })
        .expect(403);
    });
  });

  describe('obras: filtro automatico por obra (RN-05)', () => {
    it('devolve ao encarregado somente as obras vinculadas a ele', async () => {
      const resposta = await request(baseUrl)
        .get('/api/obras')
        .set('Authorization', `Bearer ${tokens['encarregado']}`)
        .expect(200);

      const corpo = resposta.body as RespostaPaginada<ObraResponse>;
      expect(corpo.itens.map((item) => item.id)).toEqual([OBRA_CENTRO]);
    });

    it('devolve ao RH todas as obras', async () => {
      const resposta = await request(baseUrl)
        .get('/api/obras')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .expect(200);

      const corpo = resposta.body as RespostaPaginada<ObraResponse>;
      expect(corpo.itens.length).toBeGreaterThanOrEqual(2);
    });

    it('nao deixa o encarregado alcancar obra nao vinculada pelo id da rota (IDOR)', async () => {
      await request(baseUrl)
        .get(`/api/obras/${OBRA_LITORAL}`)
        .set('Authorization', `Bearer ${tokens['encarregado']}`)
        .expect(404);
    });

    it('nao deixa o encarregado sem vinculo ver obra alguma', async () => {
      const resposta = await request(baseUrl)
        .get('/api/obras')
        .set('Authorization', `Bearer ${tokens['encarregado2']}`)
        .expect(200);

      const corpo = resposta.body as RespostaPaginada<ObraResponse>;
      expect(corpo).toMatchObject({ itens: [], total: 0 });
    });

    it('permite ao encarregado abrir a obra vinculada', async () => {
      const resposta = await request(baseUrl)
        .get(`/api/obras/${OBRA_CENTRO}`)
        .set('Authorization', `Bearer ${tokens['encarregado']}`)
        .expect(200);

      expect((resposta.body as ObraResponse).nome).toBe('Obra Centro');
    });

    it('ignora obraId enviado no corpo: o escopo vem do token', async () => {
      // `obraId` nao existe no DTO; whitelist + forbidNonWhitelisted derrubam.
      await request(baseUrl)
        .get('/api/obras')
        .query({ obrasPermitidas: OBRA_LITORAL })
        .set('Authorization', `Bearer ${tokens['encarregado']}`)
        .expect(400);
    });
  });

  describe('obras: CRUD (RF-008)', () => {
    let criadaId: string;

    it('cria a obra pelo RH', async () => {
      const resposta = await request(baseUrl)
        .post('/api/obras')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({ nome: 'Obra Nova', endereco: 'Rua B, 200' })
        .expect(201);

      const corpo = resposta.body as ObraResponse;
      criadaId = corpo.id;
      expect(corpo).toMatchObject({ nome: 'Obra Nova', ativa: true });
    });

    it('recusa nome repetido com 409', async () => {
      await request(baseUrl)
        .post('/api/obras')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({ nome: 'obra nova' })
        .expect(409);
    });

    it('recusa campo fora do contrato (mass assignment)', async () => {
      await request(baseUrl)
        .post('/api/obras')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({ nome: 'Obra com extra', ativa: false })
        .expect(400);
    });

    it('desativa a obra em vez de excluir', async () => {
      const resposta = await request(baseUrl)
        .patch(`/api/obras/${criadaId}`)
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({ ativa: false })
        .expect(200);

      expect((resposta.body as ObraResponse).ativa).toBe(false);
      expect(obras.obras.some((item) => item.id === criadaId)).toBe(true);
    });

    it('nao expoe rota de exclusao de obra', async () => {
      await request(baseUrl)
        .delete(`/api/obras/${criadaId}`)
        .set('Authorization', `Bearer ${tokens['admin']}`)
        .expect(404);
    });

    it('responde 404 para obra inexistente', async () => {
      await request(baseUrl)
        .get(`/api/obras/${randomUUID()}`)
        .set('Authorization', `Bearer ${tokens['admin']}`)
        .expect(404);
    });

    it('recusa id que nao e uuid com 400', async () => {
      await request(baseUrl)
        .get('/api/obras/nao-e-uuid')
        .set('Authorization', `Bearer ${tokens['admin']}`)
        .expect(400);
    });
  });

  describe('vinculo de encarregados (RF-003)', () => {
    it('e exclusivo do ADMIN', async () => {
      for (const chave of ['rh', 'encarregado', 'financeiro']) {
        await request(baseUrl)
          .get(`/api/obras/${OBRA_CENTRO}/encarregados`)
          .set('Authorization', `Bearer ${tokens[chave]}`)
          .expect(403);

        await request(baseUrl)
          .put(`/api/obras/${OBRA_CENTRO}/encarregados`)
          .set('Authorization', `Bearer ${tokens[chave]}`)
          .send({ usuariosIds: [] })
          .expect(403);
      }
    });

    it('substitui a lista e audita a acao (RF-005)', async () => {
      const resposta = await request(baseUrl)
        .put(`/api/obras/${OBRA_LITORAL}/encarregados`)
        .set('Authorization', `Bearer ${tokens['admin']}`)
        .send({ usuariosIds: [ids['encarregado2']] })
        .expect(200);

      const corpo = resposta.body as EncarregadoObraResponse[];
      expect(corpo.map((item) => item.usuarioId)).toEqual([ids['encarregado2']]);

      const logs = banco.logsDaAcao(AcaoAuditoria.OBRA_ENCARREGADOS_ALTERADOS);
      expect(logs.at(-1)).toMatchObject({
        entidade: 'obra',
        entidadeId: OBRA_LITORAL,
        usuarioId: ids['admin'],
      });
    });

    it('passa a liberar a obra recem-vinculada ao encarregado', async () => {
      await request(baseUrl)
        .get(`/api/obras/${OBRA_LITORAL}`)
        .set('Authorization', `Bearer ${tokens['encarregado2']}`)
        .expect(200);
    });

    it('recusa vincular usuario que nao e encarregado', async () => {
      await request(baseUrl)
        .put(`/api/obras/${OBRA_CENTRO}/encarregados`)
        .set('Authorization', `Bearer ${tokens['admin']}`)
        .send({ usuariosIds: [ids['rh']] })
        .expect(400);
    });

    it('recusa id que nao e uuid no corpo', async () => {
      await request(baseUrl)
        .put(`/api/obras/${OBRA_CENTRO}/encarregados`)
        .set('Authorization', `Bearer ${tokens['admin']}`)
        .send({ usuariosIds: ['nao-e-uuid'] })
        .expect(400);
    });
  });

  describe('jornadas (RF-009)', () => {
    let criadaId: string;

    it('e restrita a ADMIN e RH', async () => {
      for (const chave of ['encarregado', 'financeiro']) {
        await request(baseUrl)
          .get('/api/jornadas')
          .set('Authorization', `Bearer ${tokens[chave]}`)
          .expect(403);
      }
    });

    it('cria jornada com horarios em minutos', async () => {
      const resposta = await request(baseUrl)
        .post('/api/jornadas')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({
          nome: 'Turno da noite',
          entradaMinutos: 1320,
          saidaMinutos: 360,
          intervaloMinutos: 60,
          cargaSemanalMinutos: 2640,
          diasSemana: [3, 1, 2],
        })
        .expect(201);

      const corpo = resposta.body as JornadaResponse;
      criadaId = corpo.id;
      expect(corpo.diasSemana).toEqual([1, 2, 3]);
      // RN-02: tolerancia padrao de 10 minutos.
      expect(corpo.toleranciaMinutos).toBe(10);
    });

    it('recusa intervalo maior que a jornada com 400', async () => {
      await request(baseUrl)
        .post('/api/jornadas')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({
          nome: 'Jornada invalida',
          entradaMinutos: 420,
          saidaMinutos: 480,
          intervaloMinutos: 120,
          cargaSemanalMinutos: 300,
          diasSemana: [1],
        })
        .expect(400);
    });

    it('recusa dia da semana fora de 1..7', async () => {
      await request(baseUrl)
        .post('/api/jornadas')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({
          nome: 'Jornada com dia invalido',
          entradaMinutos: 420,
          saidaMinutos: 1020,
          intervaloMinutos: 60,
          cargaSemanalMinutos: 2640,
          diasSemana: [0],
        })
        .expect(400);
    });

    it('desativa a jornada em vez de excluir', async () => {
      const resposta = await request(baseUrl)
        .patch(`/api/jornadas/${criadaId}`)
        .set('Authorization', `Bearer ${tokens['admin']}`)
        .send({ ativa: false })
        .expect(200);

      expect((resposta.body as JornadaResponse).ativa).toBe(false);
    });

    it('nao expoe rota de exclusao de jornada', async () => {
      await request(baseUrl)
        .delete(`/api/jornadas/${criadaId}`)
        .set('Authorization', `Bearer ${tokens['admin']}`)
        .expect(404);
    });
  });

  describe('feriados (RF-011)', () => {
    let criadoId: string;

    it('permite leitura ao ENCARREGADO e recusa ao FINANCEIRO', async () => {
      await request(baseUrl)
        .get('/api/feriados')
        .query({ ano: 2027 })
        .set('Authorization', `Bearer ${tokens['encarregado']}`)
        .expect(200);

      await request(baseUrl)
        .get('/api/feriados')
        .query({ ano: 2027 })
        .set('Authorization', `Bearer ${tokens['financeiro']}`)
        .expect(403);
    });

    it('recusa cadastro ao ENCARREGADO', async () => {
      await request(baseUrl)
        .post('/api/feriados')
        .set('Authorization', `Bearer ${tokens['encarregado']}`)
        .send({ data: '2027-06-24', descricao: 'Sao Joao', abrangencia: 'NACIONAL' })
        .expect(403);
    });

    it('cadastra feriado estadual com UF', async () => {
      const resposta = await request(baseUrl)
        .post('/api/feriados')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({
          data: '2027-07-02',
          descricao: 'Independencia da Bahia',
          abrangencia: 'ESTADUAL',
          uf: 'ba',
        })
        .expect(201);

      const corpo = resposta.body as FeriadoResponse;
      criadoId = corpo.id;
      expect(corpo).toMatchObject({ data: '2027-07-02', uf: 'BA', municipio: null });
    });

    it('recusa feriado nacional com UF', async () => {
      await request(baseUrl)
        .post('/api/feriados')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({
          data: '2027-05-01',
          descricao: 'Dia do Trabalho',
          abrangencia: 'NACIONAL',
          uf: 'BA',
        })
        .expect(400);
    });

    it('recusa data fora do formato AAAA-MM-DD', async () => {
      await request(baseUrl)
        .post('/api/feriados')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({ data: '01/05/2027', descricao: 'Dia do Trabalho', abrangencia: 'NACIONAL' })
        .expect(400);
    });

    it('recusa data inexistente no calendario', async () => {
      await request(baseUrl)
        .post('/api/feriados')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({ data: '2027-02-30', descricao: 'Dia inexistente', abrangencia: 'NACIONAL' })
        .expect(400);
    });

    it('faz a carga dos feriados nacionais e repete sem duplicar', async () => {
      const primeira = await request(baseUrl)
        .post('/api/feriados/nacionais')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({ ano: 2027 })
        .expect(200);

      const corpo = primeira.body as { criados: number; jaExistentes: number };
      // O Natal de 2027 ja estava no calendario semeado.
      expect(corpo.criados).toBeGreaterThan(0);
      expect(corpo.jaExistentes).toBe(1);

      const segunda = await request(baseUrl)
        .post('/api/feriados/nacionais')
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .send({ ano: 2027 })
        .expect(200);

      expect((segunda.body as { criados: number }).criados).toBe(0);
    });

    it('lista somente o ano pedido', async () => {
      const resposta = await request(baseUrl)
        .get('/api/feriados')
        .query({ ano: 2030 })
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .expect(200);

      expect(resposta.body as FeriadoResponse[]).toEqual([]);
    });

    it('remove o feriado', async () => {
      await request(baseUrl)
        .delete(`/api/feriados/${criadoId}`)
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .expect(204);

      await request(baseUrl)
        .delete(`/api/feriados/${criadoId}`)
        .set('Authorization', `Bearer ${tokens['rh']}`)
        .expect(404);
    });
  });
});
