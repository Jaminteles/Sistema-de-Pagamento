import { ApiProperty } from '@nestjs/swagger';
import {
  type DiaLancamentoRequest,
  type LancarFuncionarioRequest,
  PONTO_MAXIMO_DIAS_LANCAMENTO,
} from '@sistema/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  Matches,
  ValidateNested,
} from 'class-validator';
import { MarcacoesLancamentoDto } from './marcacoes-lancamento.dto';

export class DiaLancamentoDto extends MarcacoesLancamentoDto implements DiaLancamentoRequest {
  @ApiProperty({ example: '2026-12-07' })
  @IsISO8601({ strict: true }, { message: 'Informe a data em AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data em AAAA-MM-DD.' })
  data!: string;
}

/**
 * Lancamento de varios dias de um funcionario (T-033 / RF-014).
 *
 * `funcionarioId` nao entra no corpo: vem do parametro de rota, que e o que o
 * escopo do encarregado (RN-05) verifica. Aceitar o id no corpo permitiria
 * lancar ponto de quem nao e da equipe.
 */
export class LancarFuncionarioDto implements LancarFuncionarioRequest {
  @ApiProperty({ type: [DiaLancamentoDto], maxItems: PONTO_MAXIMO_DIAS_LANCAMENTO })
  @IsArray()
  @ArrayMinSize(1, { message: 'Envie pelo menos um dia.' })
  @ArrayMaxSize(PONTO_MAXIMO_DIAS_LANCAMENTO, {
    message: `Envie no maximo ${PONTO_MAXIMO_DIAS_LANCAMENTO} dias por chamada.`,
  })
  @ValidateNested({ each: true })
  @Type(() => DiaLancamentoDto)
  dias!: DiaLancamentoDto[];
}
