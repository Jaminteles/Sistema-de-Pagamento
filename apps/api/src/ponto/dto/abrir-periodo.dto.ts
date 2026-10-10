import { ApiProperty } from '@nestjs/swagger';
import type { AbrirPeriodoRequest } from '@sistema/shared';
import { Matches } from 'class-validator';

/**
 * Abertura do periodo de apuracao (RF-013).
 *
 * So a competencia entra: inicio e fim saem do mes cheio (RN-01), no back-end.
 * Aceitar datas do cliente deixaria o periodo com o recorte que ele quisesse.
 */
export class AbrirPeriodoDto implements AbrirPeriodoRequest {
  @ApiProperty({ example: '2026-12', description: 'Competencia em AAAA-MM' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Informe a competencia em AAAA-MM.' })
  competencia!: string;
}
