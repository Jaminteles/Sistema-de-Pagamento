import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  type AjustarDiaResponse,
  API_PREFIX,
  type ApurarPeriodoResponse,
  CampoAjuste,
  type EnviarPeriodoRhResponse,
  type GerarDiasResponse,
  type GradeEquipeResponse,
  type ImportarMarcacoesResponse,
  type LancarPontoResponse,
  OcorrenciaDia,
  OrigemMarcacao,
  type PeriodoResponse,
  PerfilUsuario,
  type PontoFuncionarioResponse,
  type RespostaPaginada,
  type ResumoEnvioRhResponse,
  type SessaoResponse,
  StatusPeriodo,
  TipoMarcacao,
} from '@sistema/shared';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { gerarHashSenha } from '../src/common/crypto/password.util';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { FuncionariosRepository } from '../src/funcionarios/funcionarios.repository';
import { ObrasRepository } from '../src/obras/obras.repository';
import { PontoRepository } from '../src/ponto/ponto.repository';
import { FuncionariosRepositorioEmMemoria } from './funcionarios-em-memoria';
import { PontoRepositorioEmMemoria } from './ponto-em-memoria';
import { PrismaEmMemoria } from './prisma-em-memoria';
import { ObrasRepositorioEmMemoria } from './repositorios-em-memoria';

const SENHA = 'senha-de-teste-123';

const OBRA_CENTRO = '019a0000-0000-7000-8000-00000000c001';
const OBRA_LITORAL = '019a0000-0000-7000-8000-00000000c002';

const ANA = '019a0000-0000-7000-8000-00000000f001';
const BRUNO = '019a0000-0000-7000-8000-00000000f002';

const PERIODO_ABERTO = '019a0000-0000-7000-8000-00000000e001';
const PERIODO_FECHADO = '019a0000-0000-7000-8000-00000000e002';

const DIA = '2026-12-07';
const DIA_FECHADO = '2026-11-10';

/**
 * Contrato HTTP do lancamento de ponto (T-031 a T-035).
 *
 * Exercita o caminho completo: guard de JWT, guard de perfil pela matriz da
 * secao 3 do Levantamento de Requisitos, DTOs com whitelist, escopo do
 * encarregado (RN-05) por id de rota e de corpo, e os bloqueios de periodo
 * (RN-06 e RN-07). Os repositorios sao dubles em memoria - nenhuma conexao
 * real, nenhuma chamada externa.
 */
describe('Periodo, grade de equipe e lancamento por funcionario (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let banco: PrismaEmMemoria;
  let obras: ObrasRepositorioEmMemoria;
  let funcionarios: FuncionariosRepositorioEmMemoria;
  let ponto: PontoRepositorioEmMemoria;

  let diaDeAna: string;
  let diaDeBruno: string;
  let diaFechadoDeAna: string;

  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const perfis: [string, PerfilUsuario][] = [
    ['admin', PerfilUsuario.ADMIN],
    ['rh', PerfilUsuario.RH],
    ['encarregado', PerfilUsuario.ENCARREGADO],
    ['financeiro', PerfilUsuario.FINANCEIRO],
  ];

  function autorizacao(chave: string): string {
    return `Bearer ${tokens[chave] as string}`;
  }

  async function entrar(chave: string): Promise<string> {
    const resposta = await request(baseUrl)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.9')
      .send({ email: `${chave}@empresa.com.br`, senha: SENHA })
      .expect(200);

    return (resposta.body as SessaoResponse).accessToken;
  }

  beforeEach(() => {
    // Cada teste parte do mesmo estado de ponto: os de gravacao alteram os dias.
    ponto.diasPonto.length = 0;
    ponto.ajustes.length = 0;
    diaDeAna = ponto.semearDia({ periodoId: PERIODO_ABERTO, funcionarioId: ANA, data: DIA }).id;
    diaDeBruno = ponto.semearDia({ periodoId: PERIODO_ABERTO, funcionarioId: BRUNO, data: DIA }).id;
    diaFechadoDeAna = ponto.semearDia({
      periodoId: PERIODO_FECHADO,
      funcionarioId: ANA,
      data: DIA_FECHADO,
    }).id;
  });

  beforeAll(async () => {
    banco = new PrismaEmMemoria();
    obras = new ObrasRepositorioEmMemoria();
    funcionarios = new FuncionariosRepositorioEmMemoria();
    ponto = new PontoRepositorioEmMemoria();

    const senhaHash = await gerarHashSenha(SENHA);

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

    funcionarios.semear({ id: ANA, nome: 'Ana Lima', cpf: '52998224725', matricula: '001' });
    funcionarios.semear({ id: BRUNO, nome: 'Bruno Melo', cpf: '11144477735', matricula: '002' });
    funcionarios.semearVinculo({
      id: '019a0000-0000-7000-8000-00000000a001',
      funcionarioId: ANA,
      obraId: OBRA_CENTRO,
    });
    funcionarios.semearVinculo({
      id: '019a0000-0000-7000-8000-00000000a002',
      funcionarioId: BRUNO,
      obraId: OBRA_LITORAL,
    });

    ponto.semearPeriodo({
      id: PERIODO_ABERTO,
      competencia: '2026-12',
      dataInicio: '2026-12-01',
      dataFim: '2026-12-31',
    });
    ponto.semearPeriodo({
      id: PERIODO_FECHADO,
      competencia: '2026-11',
      dataInicio: '2026-11-01',
      dataFim: '2026-11-30',
      status: StatusPeriodo.FECHADO,
    });
    ponto.semearVinculo({
      funcionarioId: ANA,
      funcionarioNome: 'Ana Lima',
      matricula: '001',
      obraId: OBRA_CENTRO,
    });
    ponto.semearVinculo({
      funcionarioId: BRUNO,
      funcionarioNome: 'Bruno Melo',
      matricula: '002',
      obraId: OBRA_LITORAL,
    });

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(banco)
      .overrideProvider(ObrasRepository)
      .useValue(obras)
      .overrideProvider(FuncionariosRepository)
      .useValue(funcionarios)
      .overrideProvider(PontoRepository)
      .useValue(ponto)
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

  describe('permissao por perfil (matriz da secao 3)', () => {
    it('exige sessao autenticada', async () => {
      await request(baseUrl).get(`/api/ponto/grade?obraId=${OBRA_CENTRO}&data=${DIA}`).expect(401);
      await request(baseUrl).get('/api/ponto/periodos').expect(401);
    });

    it('permite ADMIN, RH e ENCARREGADO verem a grade', async () => {
      for (const chave of ['admin', 'rh', 'encarregado']) {
        await request(baseUrl)
          .get(`/api/ponto/grade?obraId=${OBRA_CENTRO}&data=${DIA}`)
          .set('Authorization', autorizacao(chave))
          .expect(200);
      }
    });

    it('recusa o FINANCEIRO em todas as rotas de ponto', async () => {
      await request(baseUrl)
        .get(`/api/ponto/grade?obraId=${OBRA_CENTRO}&data=${DIA}`)
        .set('Authorization', autorizacao('financeiro'))
        .expect(403);

      await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('financeiro'))
        .send({ obraId: OBRA_CENTRO, data: DIA, itens: [{ funcionarioId: ANA }] })
        .expect(403);

      await request(baseUrl)
        .get('/api/ponto/periodos')
        .set('Authorization', autorizacao('financeiro'))
        .expect(403);

      await request(baseUrl)
        .get(`/api/ponto/funcionarios/${ANA}?inicio=${DIA}&fim=${DIA}`)
        .set('Authorization', autorizacao('financeiro'))
        .expect(403);
    });

    it('deixa a abertura de periodo apenas para ADMIN e RH', async () => {
      await request(baseUrl)
        .post('/api/ponto/periodos')
        .set('Authorization', autorizacao('encarregado'))
        .send({ competencia: '2027-02' })
        .expect(403);

      await request(baseUrl)
        .post(`/api/ponto/periodos/${PERIODO_ABERTO}/dias`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(403);
    });
  });

  describe('escopo do encarregado (RN-05)', () => {
    it('responde 404 na grade de obra que nao e dele', async () => {
      await request(baseUrl)
        .get(`/api/ponto/grade?obraId=${OBRA_LITORAL}&data=${DIA}`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(404);
    });

    it('responde 404 ao tentar lancar em obra que nao e dele', async () => {
      await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('encarregado'))
        .send({
          obraId: OBRA_LITORAL,
          data: DIA,
          itens: [{ funcionarioId: BRUNO, entrada: '07:00' }],
        })
        .expect(404);
    });

    it('nao grava funcionario de outra obra enviado no corpo da grade', async () => {
      const resposta = await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('encarregado'))
        .send({
          obraId: OBRA_CENTRO,
          data: DIA,
          itens: [{ funcionarioId: BRUNO, entrada: '07:00' }],
        })
        .expect(200);

      const corpo = resposta.body as LancarPontoResponse;
      expect(corpo.salvos).toBe(0);
      expect(corpo.erros[0]?.funcionarioId).toBe(BRUNO);
      expect(corpo.erros[0]?.motivo).toContain('equipe desta obra');
    });

    it('responde 404 na visao e no lancamento de funcionario fora do escopo', async () => {
      await request(baseUrl)
        .get(`/api/ponto/funcionarios/${BRUNO}?inicio=${DIA}&fim=${DIA}`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(404);

      await request(baseUrl)
        .put(`/api/ponto/funcionarios/${BRUNO}/dias`)
        .set('Authorization', autorizacao('encarregado'))
        .send({ dias: [{ data: DIA, entrada: '07:00' }] })
        .expect(404);
    });

    it('mostra somente a equipe da obra consultada', async () => {
      const resposta = await request(baseUrl)
        .get(`/api/ponto/grade?obraId=${OBRA_CENTRO}&data=${DIA}`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(200);

      const corpo = resposta.body as GradeEquipeResponse;
      expect(corpo.linhas.map((linha) => linha.funcionarioId)).toEqual([ANA]);
      expect(corpo.obraNome).toBe('Obra Centro');
      expect(corpo.periodo?.competencia).toBe('2026-12');
      expect(corpo.editavel).toBe(true);
      expect(corpo.linhas[0]?.jornada.entradaMinutos).toBe(420);
    });
  });

  describe('lancamento em lote da grade (RF-013 a RF-016)', () => {
    it('grava o dia da equipe e devolve as marcacoes em HH:MM', async () => {
      const resposta = await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('encarregado'))
        .send({
          obraId: OBRA_CENTRO,
          data: DIA,
          itens: [
            {
              funcionarioId: ANA,
              entrada: '07:00',
              saidaIntervalo: '11:00',
              retornoIntervalo: '12:00',
              saida: '17:00',
            },
          ],
        })
        .expect(200);

      const corpo = resposta.body as LancarPontoResponse;
      expect(corpo.salvos).toBe(1);
      expect(corpo.erros).toEqual([]);
      expect(corpo.dias[0]?.marcacoes.map((item) => item.hora)).toEqual([
        '07:00',
        '11:00',
        '12:00',
        '17:00',
      ]);
      expect(corpo.dias[0]?.marcacoes[0]?.tipo).toBe(TipoMarcacao.ENTRADA);
    });

    it('recusa horario fora de HH:MM e campo desconhecido', async () => {
      await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('rh'))
        .send({ obraId: OBRA_CENTRO, data: DIA, itens: [{ funcionarioId: ANA, entrada: '7h' }] })
        .expect(400);

      await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('rh'))
        .send({
          obraId: OBRA_CENTRO,
          data: DIA,
          itens: [{ funcionarioId: ANA, entrada: '07:00', minutosExtras50: 120 }],
        })
        .expect(400);
    });

    it('devolve o erro da marcacao fora de ordem sem gravar a linha', async () => {
      const resposta = await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('rh'))
        .send({
          obraId: OBRA_CENTRO,
          data: DIA,
          itens: [{ funcionarioId: ANA, entrada: '08:00', saida: '07:00' }],
        })
        .expect(200);

      const corpo = resposta.body as LancarPontoResponse;
      expect(corpo.salvos).toBe(0);
      expect(corpo.erros[0]?.campo).toBe(TipoMarcacao.SAIDA);
    });

    it('recusa ocorrencia sem trabalho junto de horario (RF-015)', async () => {
      const resposta = await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('rh'))
        .send({
          obraId: OBRA_CENTRO,
          data: DIA,
          itens: [{ funcionarioId: ANA, ocorrencia: OcorrenciaDia.FALTA, entrada: '07:00' }],
        })
        .expect(200);

      const corpo = resposta.body as LancarPontoResponse;
      expect(corpo.salvos).toBe(0);
      expect(corpo.erros[0]?.campo).toBe('OCORRENCIA');
    });

    it('registra a falta do dia sem marcacao', async () => {
      const resposta = await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('rh'))
        .send({
          obraId: OBRA_CENTRO,
          data: DIA,
          itens: [{ funcionarioId: ANA, ocorrencia: OcorrenciaDia.FALTA }],
        })
        .expect(200);

      const corpo = resposta.body as LancarPontoResponse;
      expect(corpo.salvos).toBe(1);
      expect(corpo.dias[0]?.ocorrencia).toBe(OcorrenciaDia.FALTA);
      expect(corpo.dias[0]?.marcacoes).toEqual([]);
    });
  });

  describe('visao e lancamento por funcionario (RF-014)', () => {
    it('devolve os dias, a jornada do dia e os totais do intervalo', async () => {
      const resposta = await request(baseUrl)
        .get(`/api/ponto/funcionarios/${ANA}?inicio=2026-12-01&fim=2026-12-31`)
        .set('Authorization', autorizacao('rh'))
        .expect(200);

      const corpo = resposta.body as PontoFuncionarioResponse;
      expect(corpo.funcionarioNome).toBe('Ana Lima');
      expect(corpo.dias.map((dia) => dia.data)).toEqual([DIA]);
      expect(corpo.jornadaPorDia[DIA]?.nome).toBe('Comercial');
      expect(corpo.totais.minutosTrabalhados).toBe(0);
      expect(corpo.periodos.map((periodo) => periodo.competencia)).toEqual(['2026-12']);
    });

    it('recusa intervalo invertido e intervalo acima do limite', async () => {
      await request(baseUrl)
        .get(`/api/ponto/funcionarios/${ANA}?inicio=2026-12-10&fim=2026-12-01`)
        .set('Authorization', autorizacao('rh'))
        .expect(400);

      await request(baseUrl)
        .get(`/api/ponto/funcionarios/${ANA}?inicio=2026-01-01&fim=2026-12-31`)
        .set('Authorization', autorizacao('rh'))
        .expect(400);
    });

    it('grava varios dias de uma vez', async () => {
      ponto.semearDia({ periodoId: PERIODO_ABERTO, funcionarioId: ANA, data: '2026-12-08' });

      const resposta = await request(baseUrl)
        .put(`/api/ponto/funcionarios/${ANA}/dias`)
        .set('Authorization', autorizacao('rh'))
        .send({
          dias: [
            { data: DIA, entrada: '07:00', saida: '17:00' },
            { data: '2026-12-08', ocorrencia: OcorrenciaDia.ATESTADO },
          ],
        })
        .expect(200);

      const corpo = resposta.body as LancarPontoResponse;
      expect(corpo.salvos).toBe(2);
      expect(corpo.erros).toEqual([]);
    });
  });

  describe('bloqueio por periodo (RN-07)', () => {
    it('recusa lancamento em periodo fechado', async () => {
      const resposta = await request(baseUrl)
        .put(`/api/ponto/funcionarios/${ANA}/dias`)
        .set('Authorization', autorizacao('admin'))
        .send({ dias: [{ data: DIA_FECHADO, entrada: '07:00' }] })
        .expect(200);

      const corpo = resposta.body as LancarPontoResponse;
      expect(corpo.salvos).toBe(0);
      expect(corpo.erros[0]?.motivo).toContain('fechado');
    });

    it('marca o dia do periodo fechado como nao editavel', async () => {
      const resposta = await request(baseUrl)
        .get(`/api/ponto/funcionarios/${ANA}?inicio=2026-11-01&fim=2026-11-30`)
        .set('Authorization', autorizacao('admin'))
        .expect(200);

      const corpo = resposta.body as PontoFuncionarioResponse;
      expect(corpo.dias[0]?.editavel).toBe(false);
    });
  });

  describe('periodo (RF-013)', () => {
    it('lista os periodos do mais recente para o mais antigo', async () => {
      const resposta = await request(baseUrl)
        .get('/api/ponto/periodos')
        .set('Authorization', autorizacao('encarregado'))
        .expect(200);

      const corpo = resposta.body as RespostaPaginada<PeriodoResponse>;
      expect(corpo.itens.map((item) => item.competencia)).toEqual(['2026-12', '2026-11']);
    });

    it('abre a competencia e gera os dias dos funcionarios vinculados', async () => {
      const resposta = await request(baseUrl)
        .post('/api/ponto/periodos')
        .set('Authorization', autorizacao('rh'))
        .send({ competencia: '2027-01' })
        .expect(201);

      const corpo = resposta.body as GerarDiasResponse;
      expect(corpo.periodo.dataInicio).toBe('2027-01-01');
      expect(corpo.periodo.dataFim).toBe('2027-01-31');
      expect(corpo.funcionarios).toBe(2);
      expect(corpo.diasCriados).toBe(62);
    });

    it('recusa competencia repetida e competencia invalida', async () => {
      await request(baseUrl)
        .post('/api/ponto/periodos')
        .set('Authorization', autorizacao('rh'))
        .send({ competencia: '2026-12' })
        .expect(409);

      await request(baseUrl)
        .post('/api/ponto/periodos')
        .set('Authorization', autorizacao('rh'))
        .send({ competencia: 'dezembro' })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Sprint 6: ajuste (RF-017), envio ao RH (RF-018), importacao (RF-019) e
  // apuracao (RF-020)
  // ---------------------------------------------------------------------------

  describe('ajuste de marcacao (T-040 / RF-017)', () => {
    const justificativa = 'Esqueceu de bater a saida; conferido com o encarregado.';

    it('recusa o FINANCEIRO no ajuste e no historico', async () => {
      await request(baseUrl)
        .put(`/api/ponto/dias/${diaDeAna}/ajuste`)
        .set('Authorization', autorizacao('financeiro'))
        .send({ justificativa, saida: '18:00' })
        .expect(403);

      await request(baseUrl)
        .get(`/api/ponto/dias/${diaDeAna}/ajustes`)
        .set('Authorization', autorizacao('financeiro'))
        .expect(403);
    });

    it('responde 404 no dia de funcionario de outra obra (RN-05)', async () => {
      await request(baseUrl)
        .put(`/api/ponto/dias/${diaDeBruno}/ajuste`)
        .set('Authorization', autorizacao('encarregado'))
        .send({ justificativa, saida: '18:00' })
        .expect(404);

      await request(baseUrl)
        .get(`/api/ponto/dias/${diaDeBruno}/ajustes`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(404);
    });

    it('exige justificativa e recusa campo fora do contrato', async () => {
      await request(baseUrl)
        .put(`/api/ponto/dias/${diaDeAna}/ajuste`)
        .set('Authorization', autorizacao('rh'))
        .send({ saida: '18:00' })
        .expect(400);

      await request(baseUrl)
        .put(`/api/ponto/dias/${diaDeAna}/ajuste`)
        .set('Authorization', autorizacao('rh'))
        .send({ justificativa: 'ok' })
        .expect(400);

      await request(baseUrl)
        .put(`/api/ponto/dias/${diaDeAna}/ajuste`)
        .set('Authorization', autorizacao('rh'))
        .send({ justificativa, saida: '18:00', funcionarioId: BRUNO })
        .expect(400);
    });

    it('grava o ajuste, reapura o dia e devolve a linha do tempo', async () => {
      await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('encarregado'))
        .send({
          obraId: OBRA_CENTRO,
          data: DIA,
          itens: [
            {
              funcionarioId: ANA,
              entrada: '07:00',
              saidaIntervalo: '11:00',
              retornoIntervalo: '12:00',
              saida: '17:00',
            },
          ],
        })
        .expect(200);

      const resposta = await request(baseUrl)
        .put(`/api/ponto/dias/${diaDeAna}/ajuste`)
        .set('Authorization', autorizacao('rh'))
        .send({ justificativa, saida: '18:00' })
        .expect(200);

      const corpo = resposta.body as AjustarDiaResponse;
      expect(corpo.dia.marcacoes.find((item) => item.tipo === TipoMarcacao.SAIDA)?.hora).toBe(
        '18:00',
      );
      // 07:00-11:00 e 12:00-18:00 = 10h, uma hora acima da jornada prevista.
      expect(corpo.dia.minutosTrabalhados).toBe(600);
      expect(corpo.dia.minutosExtras50).toBe(60);
      expect(corpo.historico).toHaveLength(1);
      expect(corpo.historico[0]?.campo).toBe(CampoAjuste.SAIDA);
      expect(corpo.historico[0]?.valorAnterior).toBe('17:00');
      expect(corpo.historico[0]?.valorNovo).toBe('18:00');
      expect(corpo.historico[0]?.justificativa).toBe(justificativa);
    });

    it('recusa ajuste em periodo fechado, inclusive do ADMIN (RN-07)', async () => {
      await request(baseUrl)
        .put(`/api/ponto/dias/${diaFechadoDeAna}/ajuste`)
        .set('Authorization', autorizacao('admin'))
        .send({ justificativa, saida: '18:00' })
        .expect(409);
    });
  });

  describe('envio do periodo ao RH (T-041 / RF-018)', () => {
    it('recusa o FINANCEIRO', async () => {
      await request(baseUrl)
        .get(`/api/ponto/periodos/${PERIODO_ABERTO}/resumo-envio?obraId=${OBRA_CENTRO}`)
        .set('Authorization', autorizacao('financeiro'))
        .expect(403);

      await request(baseUrl)
        .post(`/api/ponto/periodos/${PERIODO_ABERTO}/envio-rh`)
        .set('Authorization', autorizacao('financeiro'))
        .send({ obraId: OBRA_CENTRO })
        .expect(403);
    });

    it('responde 404 para obra que nao e do encarregado (RN-05)', async () => {
      await request(baseUrl)
        .get(`/api/ponto/periodos/${PERIODO_ABERTO}/resumo-envio?obraId=${OBRA_LITORAL}`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(404);

      await request(baseUrl)
        .post(`/api/ponto/periodos/${PERIODO_ABERTO}/envio-rh`)
        .set('Authorization', autorizacao('encarregado'))
        .send({ obraId: OBRA_LITORAL })
        .expect(404);
    });

    it('acusa o dia sem lancamento no resumo da equipe', async () => {
      const resposta = await request(baseUrl)
        .get(`/api/ponto/periodos/${PERIODO_ABERTO}/resumo-envio?obraId=${OBRA_CENTRO}`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(200);

      const corpo = resposta.body as ResumoEnvioRhResponse;
      expect(corpo.funcionarios).toBe(1);
      expect(corpo.podeEnviar).toBe(true);
      expect(corpo.totalPendencias).toBe(1);
      expect(corpo.pendencias[0]?.diasSemLancamento).toEqual([DIA]);
    });

    it('envia a equipe e bloqueia o encarregado naquele dia (RN-06)', async () => {
      const envio = await request(baseUrl)
        .post(`/api/ponto/periodos/${PERIODO_ABERTO}/envio-rh`)
        .set('Authorization', autorizacao('encarregado'))
        .send({ obraId: OBRA_CENTRO })
        .expect(200);

      const corpo = envio.body as EnviarPeriodoRhResponse;
      expect(corpo.diasEnviados).toBe(1);
      expect(corpo.funcionarios).toBe(1);

      const grade = await request(baseUrl)
        .get(`/api/ponto/grade?obraId=${OBRA_CENTRO}&data=${DIA}`)
        .set('Authorization', autorizacao('encarregado'))
        .expect(200);

      expect((grade.body as GradeEquipeResponse).linhas[0]?.dia?.editavel).toBe(false);

      const lancamento = await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('encarregado'))
        .send({ obraId: OBRA_CENTRO, data: DIA, itens: [{ funcionarioId: ANA, entrada: '08:00' }] })
        .expect(200);

      const resultado = lancamento.body as LancarPontoResponse;
      expect(resultado.salvos).toBe(0);
      expect(resultado.erros[0]?.motivo).toContain('enviado ao RH');

      // O RH continua podendo ajustar o que recebeu.
      await request(baseUrl)
        .put(`/api/ponto/dias/${diaDeAna}/ajuste`)
        .set('Authorization', autorizacao('rh'))
        .send({ justificativa: 'Conferencia do RH apos o envio da equipe.', entrada: '07:00' })
        .expect(200);
    });

    it('repete o envio sem contar o mesmo dia duas vezes', async () => {
      await request(baseUrl)
        .post(`/api/ponto/periodos/${PERIODO_ABERTO}/envio-rh`)
        .set('Authorization', autorizacao('rh'))
        .send({ obraId: OBRA_CENTRO })
        .expect(200);

      const segundo = await request(baseUrl)
        .post(`/api/ponto/periodos/${PERIODO_ABERTO}/envio-rh`)
        .set('Authorization', autorizacao('rh'))
        .send({ obraId: OBRA_CENTRO })
        .expect(200);

      expect((segundo.body as EnviarPeriodoRhResponse).diasEnviados).toBe(0);
    });
  });

  describe('importacao de marcacoes por CSV (T-042 / RF-019)', () => {
    const csv = [
      'matricula;data;entrada;saida_intervalo;retorno_intervalo;saida',
      `001;${DIA};07:00;11:00;12:00;17:00`,
    ].join('\n');

    it('deixa a importacao apenas para ADMIN e RH', async () => {
      for (const chave of ['encarregado', 'financeiro']) {
        await request(baseUrl)
          .post('/api/ponto/marcacoes/importacao')
          .set('Authorization', autorizacao(chave))
          .attach('arquivo', Buffer.from(csv, 'utf8'), 'marcacoes.csv')
          .expect(403);
      }
    });

    it('recusa a chamada sem arquivo', async () => {
      await request(baseUrl)
        .post('/api/ponto/marcacoes/importacao')
        .set('Authorization', autorizacao('rh'))
        .expect(400);
    });

    it('importa o dia com origem IMPORTADO e ja apurado', async () => {
      const resposta = await request(baseUrl)
        .post('/api/ponto/marcacoes/importacao')
        .set('Authorization', autorizacao('rh'))
        .attach('arquivo', Buffer.from(csv, 'utf8'), 'marcacoes.csv')
        .expect(200);

      const corpo = resposta.body as ImportarMarcacoesResponse;
      expect(corpo.totalLinhas).toBe(1);
      expect(corpo.gravados).toBe(1);
      expect(corpo.erros).toEqual([]);

      const grade = await request(baseUrl)
        .get(`/api/ponto/grade?obraId=${OBRA_CENTRO}&data=${DIA}`)
        .set('Authorization', autorizacao('rh'))
        .expect(200);

      const dia = (grade.body as GradeEquipeResponse).linhas[0]?.dia;
      expect(dia?.marcacoes.every((marcacao) => marcacao.origem === OrigemMarcacao.IMPORTADO)).toBe(
        true,
      );
      expect(dia?.minutosTrabalhados).toBe(540);
      expect(dia?.apuradoEm).not.toBeNull();
    });
  });

  describe('apuracao do periodo (T-043 / RF-020)', () => {
    it('deixa o recalculo apenas para ADMIN e RH', async () => {
      for (const chave of ['encarregado', 'financeiro']) {
        await request(baseUrl)
          .post(`/api/ponto/periodos/${PERIODO_ABERTO}/apuracao`)
          .set('Authorization', autorizacao(chave))
          .expect(403);
      }
    });

    it('recalcula os totais do periodo', async () => {
      await request(baseUrl)
        .put('/api/ponto/grade')
        .set('Authorization', autorizacao('rh'))
        .send({
          obraId: OBRA_CENTRO,
          data: DIA,
          itens: [
            {
              funcionarioId: ANA,
              entrada: '07:00',
              saidaIntervalo: '11:00',
              retornoIntervalo: '12:00',
              saida: '17:30',
            },
          ],
        })
        .expect(200);

      const resposta = await request(baseUrl)
        .post(`/api/ponto/periodos/${PERIODO_ABERTO}/apuracao`)
        .set('Authorization', autorizacao('rh'))
        .expect(200);

      const corpo = resposta.body as ApurarPeriodoResponse;
      expect(corpo.dias).toBe(2);
      expect(corpo.totais.minutosTrabalhados).toBe(570);
      expect(corpo.totais.minutosExtras50).toBe(30);
    });

    it('responde 404 em periodo inexistente', async () => {
      await request(baseUrl)
        .post('/api/ponto/periodos/019a0000-0000-7000-8000-0000000000ff/apuracao')
        .set('Authorization', autorizacao('rh'))
        .expect(404);
    });
  });
});
