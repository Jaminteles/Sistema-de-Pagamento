import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, Matches } from 'class-validator';

/**
 * Intervalo da visao por funcionario (RF-014).
 *
 * A semana e o mes da tela sao so dois intervalos diferentes; o tamanho maximo
 * e cobrado no service (PONTO_MAXIMO_DIAS_CONSULTA), para a consulta nao virar
 * um ano inteiro de uma vez.
 */
export class IntervaloQuery {
  @ApiProperty({ example: '2026-12-07', description: 'Primeiro dia em AAAA-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'Informe o inicio em AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe o inicio em AAAA-MM-DD.' })
  inicio!: string;

  @ApiProperty({ example: '2026-12-13', description: 'Ultimo dia em AAAA-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'Informe o fim em AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe o fim em AAAA-MM-DD.' })
  fim!: string;
}
