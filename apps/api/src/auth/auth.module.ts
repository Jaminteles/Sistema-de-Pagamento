import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OrigemMesmaSiteGuard } from './guards/origem-mesma-site.guard';
import { PerfisGuard } from './guards/perfis.guard';
import { SessaoService } from './sessao.service';

/**
 * Autenticacao e sessao (RF-001, RF-004).
 *
 * O JwtModule entra sem segredo registrado: cada assinatura informa qual
 * segredo usar (acesso ou refresh), para que os dois nunca se confundam.
 *
 * Os guards sao exportados porque entram como guards globais no AppModule.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, SessaoService, JwtAuthGuard, PerfisGuard, OrigemMesmaSiteGuard],
  exports: [AuthService, SessaoService, JwtAuthGuard, PerfisGuard],
})
export class AuthModule {}
