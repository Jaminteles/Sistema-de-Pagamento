import { ApiProperty } from '@nestjs/swagger';
import {
  AJUSTE_JUSTIFICATIVA_TAMANHO_MAXIMO,
  AJUSTE_JUSTIFICATIVA_TAMANHO_MINIMO,
  type AjustarDiaRequest,
} from '@sistema/shared';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { MarcacoesLancamentoDto } from './marcacoes-lancamento.dto';

/**
 * Ajuste de um dia ja lancado (T-040 / RF-017).
 *
 * Herda os campos do lancamento (quatro horarios, ocorrencia e observacao) e
 * acrescenta a justificativa, que aqui e obrigatoria. O tamanho minimo existe
 * para o historico dizer algo: "ok" nao explica nada quando alguem reler o
 * ajuste meses depois.
 *
 * O dia vem do parametro de rota, nunca do corpo: e o id de rota que passa pelo
 * escopo do encarregado (RN-05).
 */
export class AjustarDiaDto extends MarcacoesLancamentoDto implements AjustarDiaRequest {
  @ApiProperty({
    minLength: AJUSTE_JUSTIFICATIVA_TAMANHO_MINIMO,
    maxLength: AJUSTE_JUSTIFICATIVA_TAMANHO_MAXIMO,
    example: 'Esqueceu de bater a saida; conferido com o encarregado da obra.',
  })
  @IsString()
  @MinLength(AJUSTE_JUSTIFICATIVA_TAMANHO_MINIMO, {
    message: `Explique o ajuste em pelo menos ${AJUSTE_JUSTIFICATIVA_TAMANHO_MINIMO} caracteres.`,
  })
  @MaxLength(AJUSTE_JUSTIFICATIVA_TAMANHO_MAXIMO)
  justificativa!: string;
}
