import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PerfisGuard } from './auth/guards/perfis.guard';
import { AuditoriaInterceptor } from './common/auditoria/auditoria.interceptor';
import { AuditoriaModule } from './common/auditoria/auditoria.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { UsuariosModule } from './usuarios/usuarios.module';

/**
 * Modulo raiz.
 *
 * Os guards abaixo valem para a aplicacao inteira, nesta ordem:
 *   1. ThrottlerGuard - rate limit (login e, nas sprints 9 e 10, pagamento);
 *   2. JwtAuthGuard   - exige access token, exceto nas rotas @Publico();
 *   3. PerfisGuard    - exige @Perfis(...) declarado; sem ele, recusa.
 *
 * Esconder menu ou rota no front-end nunca substitui esses guards.
 */
@Module({
  imports: [
    ConfigModule,
    // Limite geral por IP. Rotas sensiveis apertam o valor com @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuditoriaModule,
    AuthModule,
    UsuariosModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: PerfisGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor },
  ],
})
export class AppModule {}
