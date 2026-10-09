import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CriarVinculoRequest } from '@sistema/shared';
import { IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

/**
 * Vinculo do funcionario a obra e jornada, com vigencia (RF-010).
 *
 * `funcionarioId` nao entra no corpo: vem do parametro de rota, que e o que o
 * escopo do encarregado (RN-05) verifica. Aceitar o id no corpo abriria
 * caminho para vincular funcionario de outra obra.
 */
export class CriarVinculoDto implements CriarVinculoRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  obraId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  jornadaId!: string;

  @ApiProperty({ example: '2026-11-23' })
  @IsISO8601({ strict: true }, { message: 'Informe o inicio da vigencia em AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe o inicio da vigencia em AAAA-MM-DD.' })
  inicioVigencia!: string;

  @ApiPropertyOptional({ example: '2027-03-31', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Informe o fim da vigencia em AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe o fim da vigencia em AAAA-MM-DD.' })
  fimVigencia?: string | null;
}
