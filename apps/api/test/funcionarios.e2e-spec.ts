import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  API_PREFIX,
  type DadosPagamentoResponse,
  type FuncionarioResponse,
  type ImportarFuncionariosResponse,
  PerfilUsuario,
  type RespostaPaginada,
  type SessaoResponse,
  TipoChavePix,
  type VinculoFuncionarioResponse,
} from '@sistema/shared';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { gerarHashSenha } from '../src/common/crypto/password.util';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { FuncionariosRepository } from '../src/funcionarios/funcionarios.repository';
import { JornadasRepository } from '../src/jornadas/jornadas.repository';
import { ObrasRepository } from '../src/obras/obras.repository';
import { FuncionariosRepositorioEmMemoria } from './funcionarios-em-memoria';
import { PrismaEmMemoria } from './prisma-em-memoria';
import {
  JornadasRepositorioEmMemoria,
  ObrasRepositorioEmMemoria,
} from './repositorios-em-memoria';

const SENHA = 'senha-de-teste-123';

const OBRA_CENTRO = '019a0000-0000-7000-8000-00000000c001';
const OBRA_LITORAL = '019a0000-0000-7000-8000-00000000c002';
const JORNADA = '019a0000-0000-7000-8000-00000000d001';

const ANA = '019a0000-0000-7000-8000-00000000f001';
const BRUNO = '019a0000-0000-7000-8000-00000000f002';
const VINCULO_BRUNO = '019a0000-0000-7000-8000-00000000a002';

const CPF_ANA = '52998224725';
const CPF_BRUNO = '11144477735';
const CPF_NOVO = '12345678909';

const CABECALHO = 'nome,cpf,matricula,cargo,admissao';

/**
 * Contrato HTTP do cadastro de funcionarios (T-024 a T-027).
 *
 * Exercita o caminho completo: guard de JWT, guard de perfil pela matriz da
 * secao 3 do Levantamento de Requisitos, DTOs com whitelist, escopo do
 * encarregado (RN-05) e mascara de dados pessoais (RNF-05). Os repositorios sao
 * dubles em memoria - nenhuma conexao real, nenhuma chamada externa.
 */
describe('Funcionarios, dados de pagamento, vinculos e importacao (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let banco: PrismaEmMemoria;
  let obras: ObrasRepositorioEmMemoria;
  let jornadas: JornadasRepositorioEmMemoria;
  let funcionarios: FuncionariosRepositorioEmMemoria;

  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  function autorizacao(chave: string): string {
    return `Bearer ${tokens[chave] as string}`;
  }

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
    funcionarios = new FuncionariosRepositorioEmMemoria();

    const senhaHash = await gerarHashSenha(SENHA);

    const perfis: [string, PerfilUsuario][] = [
      ['admin', PerfilUsuario.ADMIN],
      ['rh', PerfilUsuario.RH],
      ['encarregado', PerfilUsuario.ENCARREGADO],
      ['financeiro', PerfilUsuario.FINANCEIRO],
    ];

    for (const [chave, perfil] of perfis) {
      const criado = (await banco.usuario.create({
        data: { nome: `Usuario ${chave}`, email: `${chave}@empresa.com.br`, senhaHash, perfil },
        select: { id: true },
      })) as { id: string };
      ids[chave] = criado.id;
    }

    obras.semear({ id: OBRA_CENTRO, nome: 'Obra Centro' });
    obras.semear({ id: OBRA_LITORAL, nome: 'Obra Litoral' });
    obras.vincular(ids['encarregado'] as string, OBRA_CENTRO);

    jornadas.semear({
      id: JORNADA,
      nome: 'Comercial',
      entradaMinutos: 420,
      saidaMinutos: 1020,
      intervaloMinutos: 60,
      cargaSemanalMinutos: 2640,
      toleranciaMinutos: 10,
      diasSemana: [1, 2, 3, 4, 5],
    });

    funcionarios.semear({ id: ANA, nome: 'Ana Lima', cpf: CPF_ANA, matricula: '001' });
    funcionarios.semear({ id: BRUNO, nome: 'Bruno Melo', cpf: CPF_BRUNO, matricula: '002' });
    funcionarios.semearVinculo({
      id: '019a0000-0000-7000-8000-00000000a001',
      funcionarioId: ANA,
      obraId: OBRA_CENTRO,
      jornadaId: JORNADA,
    });
    funcionarios.semearVinculo({
      id: VINCULO_BRUNO,
      funcionarioId: BRUNO,
      obraId: OBRA_LITORAL,
      jornadaId: JORNADA,
    });

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(banco)
      .overrideProvider(ObrasRepository)
      .useValue(obras)
      .overrideProvider(JornadasRepository)
      .useValue(jornadas)
      .overrideProvider(FuncionariosRepository)
      .useValue(funcionarios)
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

  describe('permissao por perfil (RF-006)', () => {
    it('exige sessao autenticada', async () => {
      await request(baseUrl).get('/api/funcionarios').expect(401);
    });

    it('permite ADMIN, RH, FINANCEIRO e ENCARREGADO consultarem', async () => {
      for (const chave of ['admin', 'rh', 'financeiro', 'encarregado']) {
        await request(baseUrl)
          .get('/api/funcionarios')
          .set('Authorization', autorizacao(chave))
          .expect(200);
      }
    });

    it('recusa cadastro para ENCARREGADO e FINANCEIRO', async () => {
      for (const chave of ['encarregado', 'financeiro']) {
        await request(baseUrl)
          .post('/api/funcionarios')
          .set('Authorization', autorizacao(chave))
          .send({
            nome: 'Pessoa Proibida',
            cpf: CPF_NOVO,
            matricula: '900',
            admissao: '2026-11-23',
          })
          .expect(403);
      }

      expect(funcionarios.funcionarios.some((item) => item.nome === 'Pessoa Proibida')).toBe(false);
    });

    it('recusa alteracao para ENCARREGADO e FINANCEIRO', async () => {
      for (const chave of ['encarregado', 'financeiro']) {
        await request(baseUrl)
          .patch(`/api/funcionarios/${ANA}`)
          .set('Authorization', autorizacao(chave))
          .send({ nome: 'Nome Trocado' })
          .expect(403);
      }
    });

    it('recusa campo fora do contrato (mass assignment)', async () => {
      await request(baseUrl)
        .post('/api/funcionarios')
        .set('Authorization', autorizacao('rh'))
        .send({
          nome: 'Carla Souza',
          cpf: CPF_NOVO,
          matricula: '003',
          admissao: '2026-11-23',
          situacao: 'DESLIGADO',
        })
        .expect(400);
    });

    it('recusa CPF invalido', async () => {
      await request(baseUrl)
        .post('/api/funcionarios')
        .set('Authorization', autorizacao('rh'))
        .send({
          nome: 'Carla Souza',
          cpf: '111.111.111-11',
          matricula: '004',
          admissao: '2026-11-23',
        })
        .expect(400);
    });
  });

  describe('escopo do encarregado (RN-05)', () => {
    it('lista somente os funcionarios das obras vinculadas a ele', async () => {
      const resposta = await request(baseUrl)
        .get('/api/funcionarios')
        .set('Authorization', autorizacao('encarregado'))
        .expect(200);

      const corpo = resposta.body as RespostaPaginada<FuncionarioResponse>;
      expect(corpo.itens.map((item) => item.id)).toEqual([ANA]);
    });

    it('responde 404 ao funcionario de outra obra pelo id da rota', async () => {
      await request(baseUrl)
        .get(`/api/funcionarios/${BRUNO}`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(404);
    });

    it('nao alcanca os vinculos do funcionario de outra obra', async () => {
      await request(baseUrl)
        .get(`/api/funcionarios/${BRUNO}/vinculos`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(404);
    });

    it('nao amplia o escopo pelo filtro de obra na query', async () => {
      const resposta = await request(baseUrl)
        .get('/api/funcionarios')
        .query({ obraId: OBRA_LITORAL })
        .set('Authorization', autorizacao('encarregado'))
        .expect(200);

      const corpo = resposta.body as RespostaPaginada<FuncionarioResponse>;
      expect(corpo.itens).toEqual([]);
    });
  });

  describe('mascara de dados pessoais (RNF-05)', () => {
    it('mascara o CPF na resposta ao encarregado', async () => {
      const resposta = await request(baseUrl)
        .get(`/api/funcionarios/${ANA}`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(200);

      const corpo = resposta.body as FuncionarioResponse;
      expect(corpo.cpfMascarado).toBe(true);
      expect(JSON.stringify(corpo)).not.toContain(CPF_ANA);
    });

    it('devolve o CPF completo ao RH', async () => {
      const resposta = await request(baseUrl)
        .get(`/api/funcionarios/${ANA}`)
        .set('Authorization', autorizacao('rh'))
        .expect(200);

      expect((resposta.body as FuncionarioResponse).cpf).toBe('529.982.247-25');
    });
  });

  describe('dados de pagamento (RF-007)', () => {
    it('recusa leitura para ENCARREGADO', async () => {
      await request(baseUrl)
        .get(`/api/funcionarios/${ANA}/dados-pagamento`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(403);
    });

    it('recusa escrita para FINANCEIRO e ENCARREGADO', async () => {
      for (const chave of ['financeiro', 'encarregado']) {
        await request(baseUrl)
          .put(`/api/funcionarios/${ANA}/dados-pagamento`)
          .set('Authorization', autorizacao(chave))
          .send({ tipoChave: TipoChavePix.EMAIL, chavePix: 'ana@empresa.com.br' })
          .expect(403);
      }
    });

    it('RH grava e o banco guarda apenas o valor criptografado (RNF-04)', async () => {
      const resposta = await request(baseUrl)
        .put(`/api/funcionarios/${ANA}/dados-pagamento`)
        .set('Authorization', autorizacao('rh'))
        .send({ tipoChave: TipoChavePix.EMAIL, chavePix: 'ana.lima@empresa.com.br' })
        .expect(200);

      const corpo = resposta.body as DadosPagamentoResponse;
      expect(corpo.chavePix).toBe('ana.lima@empresa.com.br');
      expect(corpo.chavePixMascara).toBe('a*******@empresa.com.br');

      const gravado = funcionarios.pagamentos.get(ANA);
      expect(gravado?.chavePixCriptografada).not.toContain('ana.lima');
    });

    it('FINANCEIRO le os dados completos', async () => {
      const resposta = await request(baseUrl)
        .get(`/api/funcionarios/${ANA}/dados-pagamento`)
        .set('Authorization', autorizacao('financeiro'))
        .expect(200);

      expect((resposta.body as DadosPagamentoResponse).mascarado).toBe(false);
    });

    it('a acao fica no log de auditoria sem a chave (RF-005)', () => {
      const logs = banco.logsDaAcao('FUNCIONARIO_DADOS_PAGAMENTO_ALTERADO');

      expect(logs.length).toBeGreaterThan(0);
      expect(JSON.stringify(logs)).not.toContain('ana.lima@empresa.com.br');
    });
  });

  describe('vinculos (RF-010)', () => {
    it('recusa criacao para ENCARREGADO', async () => {
      await request(baseUrl)
        .post(`/api/funcionarios/${ANA}/vinculos`)
        .set('Authorization', autorizacao('encarregado'))
        .send({ obraId: OBRA_CENTRO, jornadaId: JORNADA, inicioVigencia: '2026-11-23' })
        .expect(403);
    });

    it('recusa segundo vinculo aberto', async () => {
      await request(baseUrl)
        .post(`/api/funcionarios/${ANA}/vinculos`)
        .set('Authorization', autorizacao('rh'))
        .send({ obraId: OBRA_CENTRO, jornadaId: JORNADA, inicioVigencia: '2026-11-23' })
        .expect(409);
    });

    it('nao altera vinculo de outro funcionario pelo id da rota', async () => {
      await request(baseUrl)
        .patch(`/api/funcionarios/${ANA}/vinculos/${VINCULO_BRUNO}`)
        .set('Authorization', autorizacao('rh'))
        .send({ fimVigencia: '2026-12-31' })
        .expect(404);
    });

    it('RH encerra e abre um novo vinculo', async () => {
      const atual = await request(baseUrl)
        .get(`/api/funcionarios/${ANA}/vinculos`)
        .set('Authorization', autorizacao('rh'))
        .expect(200);

      const aberto = (atual.body as VinculoFuncionarioResponse[])[0];

      await request(baseUrl)
        .patch(`/api/funcionarios/${ANA}/vinculos/${aberto?.id as string}`)
        .set('Authorization', autorizacao('rh'))
        .send({ fimVigencia: '2026-11-30' })
        .expect(200);

      const criado = await request(baseUrl)
        .post(`/api/funcionarios/${ANA}/vinculos`)
        .set('Authorization', autorizacao('rh'))
        .send({ obraId: OBRA_CENTRO, jornadaId: JORNADA, inicioVigencia: '2026-12-01' })
        .expect(201);

      expect((criado.body as VinculoFuncionarioResponse).inicioVigencia).toBe('2026-12-01');
    });
  });

  describe('importacao por planilha (RF-012)', () => {
    const planilha = Buffer.from(
      [CABECALHO, `Carla Souza,${CPF_NOVO},010,Serralheira,2026-11-23`].join('\n'),
      'utf8',
    );

    it('recusa importacao para ENCARREGADO e FINANCEIRO', async () => {
      for (const chave of ['encarregado', 'financeiro']) {
        await request(baseUrl)
          .post('/api/funcionarios/importacao')
          .set('Authorization', autorizacao(chave))
          .attach('arquivo', planilha, 'funcionarios.csv')
          .expect(403);
      }
    });

    it('recusa requisicao sem arquivo', async () => {
      await request(baseUrl)
        .post('/api/funcionarios/importacao/previa')
        .set('Authorization', autorizacao('rh'))
        .expect(400);
    });

    it('a previa nao grava nada', async () => {
      const antes = funcionarios.funcionarios.length;

      const resposta = await request(baseUrl)
        .post('/api/funcionarios/importacao/previa')
        .set('Authorization', autorizacao('rh'))
        .attach('arquivo', planilha, 'funcionarios.csv')
        .expect(200);

      const corpo = resposta.body as ImportarFuncionariosResponse;
      expect(corpo.simulacao).toBe(true);
      expect(corpo.criados).toBe(1);
      expect(funcionarios.funcionarios).toHaveLength(antes);
    });

    it('RH importa a planilha', async () => {
      const resposta = await request(baseUrl)
        .post('/api/funcionarios/importacao')
        .set('Authorization', autorizacao('rh'))
        .attach('arquivo', planilha, 'funcionarios.csv')
        .expect(200);

      const corpo = resposta.body as ImportarFuncionariosResponse;
      expect(corpo.criados).toBe(1);
      expect(funcionarios.funcionarios.some((item) => item.cpf === CPF_NOVO)).toBe(true);
    });
  });
});
