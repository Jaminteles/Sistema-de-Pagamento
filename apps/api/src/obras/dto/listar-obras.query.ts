import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  type FiltroObras,
  PAGINACAO_TAMANHO_MAXIMO,
  PAGINACAO_TAMANHO_PADRAO,
  type ParametrosPaginacao,
} from '@sistema/shared';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { paraBoolean, paraInteiro } from '../../common/dto/transformacoes';

/** Filtros e paginacao de GET /api/obras. */
export class ListarObrasQuery implements FiltroObras, ParametrosPaginacao {
  @ApiPropertyOptional({ description: 'Busca por nome ou endereco' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
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
