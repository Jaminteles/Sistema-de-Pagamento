import { Module } from '@nestjs/common';
import { PrismaModule } from './common/prisma/prisma.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';

/**
 * Modulo raiz. Os modulos de dominio (usuarios, ponto, pagamentos) entram
 * nas sprints seguintes, cada um com guard de JWT e guard de perfil.
 */
@Module({
  imports: [ConfigModule, PrismaModule, HealthModule],
})
export class AppModule {}
