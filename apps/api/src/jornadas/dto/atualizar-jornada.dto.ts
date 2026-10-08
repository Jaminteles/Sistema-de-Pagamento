import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  type AtualizarJornadaRequest,
  DIAS_SEMANA,
  JORNADA_CARGA_SEMANAL_MAXIMA_MINUTOS,
  JORNADA_INTERVALO_MAXIMO_MINUTOS,
  JORNADA_NOME_TAMANHO_MAXIMO,
  JORNADA_TOLERANCIA_MAXIMA_MINUTOS,
  MINUTOS_NO_DIA,
} from '@sistema/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Atualizacao de jornada (RF-009).
 *
 * Nao existe exclusao: `ativa: false` tira a jornada dos novos vinculos e
 * preserva os periodos de ponto que ja apuraram por ela.
 */
export class AtualizarJornadaDto implements AtualizarJornadaRequest {
  @ApiPropertyOptional({ maxLength: JORNADA_NOME_TAMANHO_MAXIMO })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(JORNADA_NOME_TAMANHO_MAXIMO)
  nome?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: MINUTOS_NO_DIA - 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MINUTOS_NO_DIA - 1)
  entradaMinutos?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: MINUTOS_NO_DIA - 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MINUTOS_NO_DIA - 1)
  saidaMinutos?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: JORNADA_INTERVALO_MAXIMO_MINUTOS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(JORNADA_INTERVALO_MAXIMO_MINUTOS)
  intervaloMinutos?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: JORNADA_CARGA_SEMANAL_MAXIMA_MINUTOS })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(JORNADA_CARGA_SEMANAL_MAXIMA_MINUTOS)
  cargaSemanalMinutos?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: JORNADA_TOLERANCIA_MAXIMA_MINUTOS })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(JORNADA_TOLERANCIA_MAXIMA_MINUTOS)
  toleranciaMinutos?: number;

  @ApiPropertyOptional({ type: [Number], minItems: 1, maxItems: 7 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsIn(DIAS_SEMANA, { each: true, message: 'Dia da semana invalido (use 1 a 7).' })
  diasSemana?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}
