import { Global, Module } from '@nestjs/common';
import { AuditoriaInterceptor } from './auditoria.interceptor';
import { AuditoriaService } from './auditoria.service';

/**
 * Global porque praticamente todo modulo de dominio audita alguma acao
 * sensivel (RF-005), do ajuste de ponto ao envio de lote.
 */
@Global()
@Module({
  providers: [AuditoriaService, AuditoriaInterceptor],
  exports: [AuditoriaService, AuditoriaInterceptor],
})
export class AuditoriaModule {}
