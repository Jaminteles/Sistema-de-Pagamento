import { ApiPropertyOptional } from '@nestjs/swagger';
import type { AtualizarVinculoRequest } from '@sistema/shared';
import { IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

/**
 * Alteracao do vinculo (RF-010). O uso mais comum e encerrar a vigencia
 * informando `fimVigencia`; `null` reabre o vinculo.
 */
export class AtualizarVinculoDto implements AtualizarVinculoRequest {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  obraId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  jornadaId?: string;

  @ApiPropertyOptional({ example: '2026-11-23' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Informe o inicio da vigencia em AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe o inicio da vigencia em AAAA-MM-DD.' })
  inicioVigencia?: string;

  @ApiPropertyOptional({ example: '2027-03-31', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Informe o fim da vigencia em AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe o fim da vigencia em AAAA-MM-DD.' })
  fimVigencia?: string | null;
}
