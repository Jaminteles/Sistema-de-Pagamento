import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../../config/app.config';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * Cliente Prisma unico da aplicacao.
 *
 * O Prisma 7 conecta por driver adapter: a connection string vem do ambiente
 * ja validado (AppConfig) e nunca aparece em log nem em resposta da API.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg({ connectionString: config.databaseUrl }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conexao com o PostgreSQL estabelecida.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
