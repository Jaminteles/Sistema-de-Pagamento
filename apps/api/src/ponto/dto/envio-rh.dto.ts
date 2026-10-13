import { ApiProperty } from '@nestjs/swagger';
import type { EnviarPeriodoRhRequest } from '@sistema/shared';
import { IsUUID } from 'class-validator';

/**
 * Envio do periodo da equipe de uma obra para o RH (T-041 / RF-018).
 *
 * Somente a obra entra no corpo: o periodo vem da rota e a equipe sai do
 * vinculo vigente, nunca de uma lista de funcionarios enviada pelo cliente -
 * seria o caminho mais curto para enviar (e bloquear) o ponto de quem nao e da
 * equipe.
 */
export class EnviarPeriodoRhDto implements EnviarPeriodoRhRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  obraId!: string;
}

/** Mesmo recorte do envio, na consulta do resumo de pendencias. */
export class ResumoEnvioQuery {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  obraId!: string;
}
