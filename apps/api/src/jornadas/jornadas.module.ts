import { Module } from '@nestjs/common';
import { JornadasController } from './jornadas.controller';
import { JornadasRepository } from './jornadas.repository';
import { JornadasService } from './jornadas.service';

/** Cadastro de jornadas (RF-009). */
@Module({
  controllers: [JornadasController],
  providers: [JornadasService, JornadasRepository],
  exports: [JornadasRepository],
})
export class JornadasModule {}
