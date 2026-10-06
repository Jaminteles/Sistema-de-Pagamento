import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX } from '@sistema/shared';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppConfig } from './config/app.config';
import { configurarSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfig);

  app.use(helmet());

  // CORS restrito a origem do front-end; credentials por causa do cookie de refresh.
  app.enableCors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });

  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (config.swaggerHabilitado) {
    const caminho = configurarSwagger(app);
    logger.log(`Swagger em /${caminho}`);
  }

  await app.listen(config.porta, '0.0.0.0');
  logger.log(`API ouvindo na porta ${config.porta} (ambiente: ${config.ambiente})`);
}

void bootstrap();
