import { ApiProperty } from '@nestjs/swagger';
import {
  type ItemLancamentoEquipeRequest,
  type LancarEquipeRequest,
  PONTO_MAXIMO_ITENS_LOTE,
} from '@sistema/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { MarcacoesLancamentoDto } from './marcacoes-lancamento.dto';

export class ItemLancamentoEquipeDto
  extends MarcacoesLancamentoDto
  implements ItemLancamentoEquipeRequest
{
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  funcionarioId!: string;
}

/**
 * Lancamento em lote da equipe de uma obra num dia (T-032 / RF-013).
 *
 * A obra e o dia ficam fora dos itens: a grade e de uma obra e de um dia, e
 * repetir isso por linha abriria caminho para o cliente misturar obras numa
 * chamada so - justamente o que o escopo do encarregado (RN-05) impede.
 */
export class LancarEquipeDto implements LancarEquipeRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  obraId!: string;

  @ApiProperty({ example: '2026-12-07' })
  @IsISO8601({ strict: true }, { message: 'Informe a data em AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data em AAAA-MM-DD.' })
  data!: string;

  @ApiProperty({ type: [ItemLancamentoEquipeDto], maxItems: PONTO_MAXIMO_ITENS_LOTE })
  @IsArray()
  @ArrayMinSize(1, { message: 'Envie pelo menos um funcionario.' })
  @ArrayMaxSize(PONTO_MAXIMO_ITENS_LOTE, {
    message: `Envie no maximo ${PONTO_MAXIMO_ITENS_LOTE} funcionarios por chamada.`,
  })
  @ValidateNested({ each: true })
  @Type(() => ItemLancamentoEquipeDto)
  itens!: ItemLancamentoEquipeDto[];
}
