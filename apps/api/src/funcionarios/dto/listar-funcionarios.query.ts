import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  type FiltroFuncionarios,
  PAGINACAO_TAMANHO_MAXIMO,
  PAGINACAO_TAMANHO_PADRAO,
  type ParametrosPaginacao,
  SITUACOES_FUNCIONARIO,
  type SituacaoFuncionario,
} from '@sistema/shared';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { paraBoolean, paraInteiro } from '../../common/dto/transformacoes';

/**
 * Filtros e paginacao de GET /api/funcionarios (RF-006).
 *
 * `obraId` so estreita o resultado: para o encarregado, o recorte por obra
 * (RN-05) continua vindo do usuario autenticado. Pedir uma obra que nao e dele
 * nao amplia nada - a intersecao e aplicada no service.
 */
export class ListarFuncionariosQuery implements FiltroFuncionarios, ParametrosPaginacao {
  @ApiPropertyOptional({ description: 'Busca por nome, matricula ou CPF' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  busca?: string;

  @ApiPropertyOptional({ enum: SITUACOES_FUNCIONARIO })
  @IsOptional()
  @IsIn(SITUACOES_FUNCIONARIO, { message: 'Situacao invalida.' })
  situacao?: SituacaoFuncionario;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  obraId?: string;

  @ApiPropertyOptional({ description: 'Somente quem tem vinculo vigente hoje' })
  @IsOptional()
  @paraBoolean()
  @IsBoolean()
  comVinculoVigente?: boolean;

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
