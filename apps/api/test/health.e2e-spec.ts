import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type ApiErrorResponse, API_PREFIX, type HealthResponse } from '@sistema/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * Verifica a fundacao da API: prefixo global, contrato do /health, pipe de
 * validacao e filtro global de erros.
 *
 * O PrismaService e substituido por um dublê: nenhum teste automatizado abre
 * conexao com banco real nem chama API externa.
 */
describe('Fundacao da API (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let bancoRespondendo = true;

  const prismaFalso = {
    $queryRaw: (): Promise<unknown> =>
      bancoRespondendo
        ? Promise.resolve([{ '?column?': 1 }])
        : Promise.reject(new Error('conexao recusada')),
    $connect: (): Promise<void> => Promise.resolve(),
    $disconnect: (): Promise<void> => Promise.resolve(),
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaFalso)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix(API_PREFIX);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());

    // Um unico servidor ouvindo em porta aleatoria. Com app.init() o supertest
    // abre e fecha o servidor a cada requisicao, o que gerava ECONNRESET.
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde GET /api/health com o contrato HealthResponse', async () => {
    bancoRespondendo = true;

    const resposta = await request(baseUrl).get('/api/health').expect(200);
    const corpo = resposta.body as HealthResponse;

    expect(corpo.status).toBe('ok');
    expect(corpo.database).toBe('up');
    expect(typeof corpo.timestamp).toBe('string');
  });

  it('marca a API como degradada quando o banco nao responde', async () => {
    bancoRespondendo = false;

    const resposta = await request(baseUrl).get('/api/health').expect(200);
    const corpo = resposta.body as HealthResponse;

    expect(corpo.status).toBe('degraded');
    expect(corpo.database).toBe('down');
    // A mensagem do erro de conexao nunca vaza para o cliente.
    expect(JSON.stringify(corpo)).not.toContain('conexao recusada');
  });

  it('exige o prefixo global /api', async () => {
    await request(baseUrl).get('/health').expect(404);
  });

  it('devolve o contrato ApiErrorResponse em rota inexistente', async () => {
    const resposta = await request(baseUrl).get('/api/nao-existe').expect(404);
    const corpo = resposta.body as ApiErrorResponse & { stack?: unknown };

    expect(corpo.statusCode).toBe(404);
    expect(corpo.path).toBe('/api/nao-existe');
    expect(typeof corpo.error).toBe('string');
    expect(typeof corpo.requestId).toBe('string');
    expect(corpo.stack).toBeUndefined();
  });
});
