import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ABRANGENCIAS_FERIADO,
  type AbrangenciaFeriado,
  type AtualizarFeriadoRequest,
  FERIADO_DESCRICAO_TAMANHO_MAXIMO,
  FERIADO_MUNICIPIO_TAMANHO_MAXIMO,
} from '@sistema/shared';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Atualizacao de feriado (RF-011). */
export class AtualizarFeriadoDto implements AtualizarFeriadoRequest {
  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Informe a data no formato AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data no formato AAAA-MM-DD.' })
  data?: string;

  @ApiPropertyOptional({ maxLength: FERIADO_DESCRICAO_TAMANHO_MAXIMO })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(FERIADO_DESCRICAO_TAMANHO_MAXIMO)
  descricao?: string;

  @ApiPropertyOptional({ enum: ABRANGENCIAS_FERIADO })
  @IsOptional()
  @IsIn(ABRANGENCIAS_FERIADO, { message: 'Abrangencia invalida.' })
  abrangencia?: AbrangenciaFeriado;

  @ApiPropertyOptional({ minLength: 2, maxLength: 2, nullable: true })
  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'Informe a UF com 2 letras.' })
  uf?: string | null;

  @ApiPropertyOptional({ maxLength: FERIADO_MUNICIPIO_TAMANHO_MAXIMO, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(FERIADO_MUNICIPIO_TAMANHO_MAXIMO)
  municipio?: string | null;
}
