import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  type FiltroJornadas,
  PAGINACAO_TAMANHO_MAXIMO,
  PAGINACAO_TAMANHO_PADRAO,
  type ParametrosPaginacao,
} from '@sistema/shared';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { paraBoolean, paraInteiro } from '../../common/dto/transformacoes';

/** Filtros e paginacao de GET /api/jornadas. */
export class ListarJornadasQuery implements FiltroJornadas, ParametrosPaginacao {
  @ApiPropertyOptional({ description: 'Busca por nome' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  busca?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @paraBoolean()
  @IsBoolean()
  ativa?: boolean;

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
