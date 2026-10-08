import { ApiProperty } from '@nestjs/swagger';
import { type DefinirEncarregadosRequest, OBRA_ENCARREGADOS_MAXIMO } from '@sistema/shared';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * Vinculo encarregado x obra (RF-003).
 *
 * Substitui a lista inteira: enviar `[]` desvincula todos. O service recusa id
 * inexistente ou de usuario que nao seja ENCARREGADO - o vinculo define o
 * escopo de leitura e de lancamento (RN-05), nao serve para ampliar o acesso de
 * outro perfil.
 */
export class DefinirEncarregadosDto implements DefinirEncarregadosRequest {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: OBRA_ENCARREGADOS_MAXIMO })
  @IsArray()
  @ArrayMaxSize(OBRA_ENCARREGADOS_MAXIMO)
  @ArrayUnique()
  @IsUUID('all', { each: true, message: 'Informe ids de usuario validos.' })
  usuariosIds!: string[];
}
