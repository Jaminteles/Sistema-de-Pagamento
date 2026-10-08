import { ApiProperty } from '@nestjs/swagger';
import {
  type CarregarFeriadosNacionaisRequest,
  FERIADO_ANO_MAXIMO,
  FERIADO_ANO_MINIMO,
} from '@sistema/shared';
import { IsInt, Max, Min } from 'class-validator';

/** Carga inicial dos feriados nacionais de um ano (RF-011). */
export class CarregarFeriadosNacionaisDto implements CarregarFeriadosNacionaisRequest {
  @ApiProperty({ minimum: FERIADO_ANO_MINIMO, maximum: FERIADO_ANO_MAXIMO, example: 2027 })
  @IsInt()
  @Min(FERIADO_ANO_MINIMO)
  @Max(FERIADO_ANO_MAXIMO)
  ano!: number;
}
