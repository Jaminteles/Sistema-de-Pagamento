import { Module } from '@nestjs/common';
import { FeriadosController } from './feriados.controller';
import { FeriadosRepository } from './feriados.repository';
import { FeriadosService } from './feriados.service';

/** Calendario de feriados (RF-011). */
@Module({
  controllers: [FeriadosController],
  providers: [FeriadosService, FeriadosRepository],
  exports: [FeriadosRepository],
})
export class FeriadosModule {}
