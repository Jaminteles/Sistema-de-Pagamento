import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ABRANGENCIAS_FERIADO,
  type AbrangenciaFeriado,
  FERIADO_ANO_MAXIMO,
  FERIADO_ANO_MINIMO,
  type FiltroFeriados,
} from '@sistema/shared';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { paraInteiro } from '../../common/dto/transformacoes';

/**
 * Filtros de GET /api/feriados.
 *
 * A listagem e por ano (o calendario de um ano tem poucas dezenas de linhas),
 * por isso nao ha paginacao. Sem `ano`, a API usa o ano corrente no fuso de
 * negocio (RNF-12).
 */
export class ListarFeriadosQuery implements FiltroFeriados {
  @ApiPropertyOptional({ minimum: FERIADO_ANO_MINIMO, maximum: FERIADO_ANO_MAXIMO })
  @IsOptional()
  @paraInteiro()
  @IsInt()
  @Min(FERIADO_ANO_MINIMO)
  @Max(FERIADO_ANO_MAXIMO)
  ano?: number;

  @ApiPropertyOptional({ enum: ABRANGENCIAS_FERIADO })
  @IsOptional()
  @IsIn(ABRANGENCIAS_FERIADO, { message: 'Abrangencia invalida.' })
  abrangencia?: AbrangenciaFeriado;

  @ApiPropertyOptional({ description: 'Busca por descricao' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  busca?: string;
}
