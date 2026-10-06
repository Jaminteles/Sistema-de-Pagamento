import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfig } from './app.config';
import { validateEnv } from './env.validation';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      // O .env fica na raiz do monorepo; em producao as variaveis vem do ambiente.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
      cache: true,
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class ConfigModule {}
