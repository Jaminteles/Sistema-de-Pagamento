import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AGENCIA_TAMANHO_MAXIMO,
  BANCO_TAMANHO_MAXIMO,
  CHAVE_PIX_TAMANHO_MAXIMO,
  CONTA_TAMANHO_MAXIMO,
  type DefinirDadosPagamentoRequest,
  TIPOS_CHAVE_PIX,
  type TipoChavePix,
} from '@sistema/shared';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Dados de pagamento do funcionario (RF-007).
 *
 * Substitui o cadastro inteiro: o que nao vier no corpo e apagado. A coerencia
 * (tipo com chave, banco com agencia e conta) e a validacao do formato da chave
 * conforme o tipo ficam no service.
 *
 * A chave e a conta sao criptografadas antes de chegar ao banco (RNF-04) e
 * nunca voltam em claro para perfil sem permissao (RNF-05).
 */
export class DefinirDadosPagamentoDto implements DefinirDadosPagamentoRequest {
  @ApiPropertyOptional({ enum: TIPOS_CHAVE_PIX, nullable: true })
  @IsOptional()
  @IsIn(TIPOS_CHAVE_PIX, { message: 'Tipo de chave Pix invalido.' })
  tipoChave?: TipoChavePix | null;

  @ApiPropertyOptional({ maxLength: CHAVE_PIX_TAMANHO_MAXIMO, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(CHAVE_PIX_TAMANHO_MAXIMO)
  chavePix?: string | null;

  @ApiPropertyOptional({
    maxLength: BANCO_TAMANHO_MAXIMO,
    nullable: true,
    description: 'Codigo do banco (COMPE), somente digitos',
  })
  @IsOptional()
  @IsString()
  @MaxLength(BANCO_TAMANHO_MAXIMO)
  @Matches(/^\d{3,10}$/, { message: 'Informe o codigo do banco somente com digitos.' })
  banco?: string | null;

  @ApiPropertyOptional({ maxLength: AGENCIA_TAMANHO_MAXIMO, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(AGENCIA_TAMANHO_MAXIMO)
  @Matches(/^\d{1,6}(-?[0-9Xx])?$/, { message: 'Agencia invalida.' })
  agencia?: string | null;

  @ApiPropertyOptional({ maxLength: CONTA_TAMANHO_MAXIMO, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(CONTA_TAMANHO_MAXIMO)
  @Matches(/^\d{1,18}(-?[0-9Xx])?$/, { message: 'Conta invalida.' })
  conta?: string | null;
}
