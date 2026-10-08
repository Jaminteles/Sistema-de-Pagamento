import { Module } from '@nestjs/common';
import { EscopoObraService } from './escopo-obra.service';
import { ObrasController } from './obras.controller';
import { ObrasRepository } from './obras.repository';
import { ObrasService } from './obras.service';

/**
 * Obras/setores (RF-008) e vinculo de encarregados (RF-003).
 *
 * Exporta o EscopoObraService: os modulos de ponto, funcionario e relatorio das
 * proximas sprints aplicam o escopo do encarregado (RN-05) por ele, em vez de
 * reescrever o filtro.
 */
@Module({
  controllers: [ObrasController],
  providers: [ObrasService, ObrasRepository, EscopoObraService],
  exports: [EscopoObraService, ObrasRepository],
})
export class ObrasModule {}
