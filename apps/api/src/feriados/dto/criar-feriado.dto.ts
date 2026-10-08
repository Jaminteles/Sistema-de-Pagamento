import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ABRANGENCIAS_FERIADO,
  type AbrangenciaFeriado,
  type CriarFeriadoRequest,
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

/**
 * Cadastro de feriado (RF-011).
 *
 * `data` e um dia do calendario, no formato "AAAA-MM-DD": feriado nao tem
 * horario. A coerencia entre abrangencia, UF e municipio e validada no service.
 */
export class CriarFeriadoDto implements CriarFeriadoRequest {
  @ApiProperty({ example: '2027-01-01', description: 'Dia do feriado em AAAA-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'Informe a data no formato AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data no formato AAAA-MM-DD.' })
  data!: string;

  @ApiProperty({ maxLength: FERIADO_DESCRICAO_TAMANHO_MAXIMO })
  @IsString()
  @MinLength(3)
  @MaxLength(FERIADO_DESCRICAO_TAMANHO_MAXIMO)
  descricao!: string;

  @ApiProperty({ enum: ABRANGENCIAS_FERIADO })
  @IsIn(ABRANGENCIAS_FERIADO, { message: 'Abrangencia invalida.' })
  abrangencia!: AbrangenciaFeriado;

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
