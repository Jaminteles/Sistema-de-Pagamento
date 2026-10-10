import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID, Matches } from 'class-validator';

/**
 * Grade de lancamento de uma obra num dia (RF-013).
 *
 * `obraId` apenas escolhe a obra: para o encarregado, o alcance continua vindo
 * do usuario autenticado (RN-05). Pedir uma obra que nao e dele responde 404.
 */
export class GradeQuery {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  obraId!: string;

  @ApiProperty({ example: '2026-12-07', description: 'Dia do ponto em AAAA-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'Informe a data em AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data em AAAA-MM-DD.' })
  data!: string;
}
