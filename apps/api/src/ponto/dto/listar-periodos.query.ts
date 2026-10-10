import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  PAGINACAO_TAMANHO_MAXIMO,
  PAGINACAO_TAMANHO_PADRAO,
  type ParametrosPaginacao,
  STATUS_PERIODO,
  type StatusPeriodo,
} from '@sistema/shared';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { paraInteiro } from '../../common/dto/transformacoes';

/** Filtros e paginacao de GET /api/ponto/periodos (RF-013). */
export class ListarPeriodosQuery implements ParametrosPaginacao {
  @ApiPropertyOptional({ enum: STATUS_PERIODO })
  @IsOptional()
  @IsIn(STATUS_PERIODO, { message: 'Status de periodo invalido.' })
  status?: StatusPeriodo;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @paraInteiro()
  @IsInt()
  @Min(1)
  pagina?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PAGINACAO_TAMANHO_MAXIMO,
    default: PAGINACAO_TAMANHO_PADRAO,
  })
  @IsOptional()
  @paraInteiro()
  @IsInt()
  @Min(1)
  @Max(PAGINACAO_TAMANHO_MAXIMO)
  tamanho?: number;
}
