import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type CriarJornadaRequest,
  DIAS_SEMANA,
  JORNADA_CARGA_SEMANAL_MAXIMA_MINUTOS,
  JORNADA_INTERVALO_MAXIMO_MINUTOS,
  JORNADA_NOME_TAMANHO_MAXIMO,
  JORNADA_TOLERANCIA_MAXIMA_MINUTOS,
  JORNADA_TOLERANCIA_PADRAO_MINUTOS,
  MINUTOS_NO_DIA,
} from '@sistema/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
 * Criacao de jornada (RF-009).
 *
 * Todos os horarios sao minutos inteiros desde a meia-noite, no fuso de negocio
 * (RNF-12). `ativa` nao entra: jornada nova nasce ativa.
 */
export class CriarJornadaDto implements CriarJornadaRequest {
  @ApiProperty({ maxLength: JORNADA_NOME_TAMANHO_MAXIMO })
  @IsString()
  @MinLength(3)
  @MaxLength(JORNADA_NOME_TAMANHO_MAXIMO)
  nome!: string;

  @ApiProperty({
    minimum: 0,
    maximum: MINUTOS_NO_DIA - 1,
    description: 'Entrada em minutos desde a meia-noite (ex.: 420 = 07:00)',
  })
  @IsInt()
  @Min(0)
  @Max(MINUTOS_NO_DIA - 1)
  entradaMinutos!: number;

  @ApiProperty({
    minimum: 0,
    maximum: MINUTOS_NO_DIA - 1,
    description: 'Saida em minutos desde a meia-noite; menor que a entrada indica virada de dia',
  })
  @IsInt()
  @Min(0)
  @Max(MINUTOS_NO_DIA - 1)
  saidaMinutos!: number;

  @ApiProperty({ minimum: 0, maximum: JORNADA_INTERVALO_MAXIMO_MINUTOS })
  @IsInt()
  @Min(0)
  @Max(JORNADA_INTERVALO_MAXIMO_MINUTOS)
  intervaloMinutos!: number;

  @ApiProperty({ minimum: 1, maximum: JORNADA_CARGA_SEMANAL_MAXIMA_MINUTOS })
  @IsInt()
  @Min(1)
  @Max(JORNADA_CARGA_SEMANAL_MAXIMA_MINUTOS)
  cargaSemanalMinutos!: number;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: JORNADA_TOLERANCIA_MAXIMA_MINUTOS,
    default: JORNADA_TOLERANCIA_PADRAO_MINUTOS,
    description: 'RN-02: tolerancia diaria, padrao 10 minutos',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(JORNADA_TOLERANCIA_MAXIMA_MINUTOS)
  toleranciaMinutos?: number;

  @ApiProperty({
    type: [Number],
    minItems: 1,
    maxItems: 7,
    description: 'Dias de trabalho em ISO-8601 (1 = segunda ... 7 = domingo)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsIn(DIAS_SEMANA, { each: true, message: 'Dia da semana invalido (use 1 a 7).' })
  diasSemana!: number[];
}
