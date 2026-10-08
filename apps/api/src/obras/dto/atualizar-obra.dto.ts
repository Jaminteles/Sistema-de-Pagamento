import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  type AtualizarObraRequest,
  OBRA_ENDERECO_TAMANHO_MAXIMO,
  OBRA_NOME_TAMANHO_MAXIMO,
} from '@sistema/shared';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Atualizacao de obra/setor (RF-008).
 *
 * Nao existe exclusao: `ativa: false` tira a obra das novas operacoes e
 * preserva o historico de ponto e de pagamento que aponta para ela.
 */
export class AtualizarObraDto implements AtualizarObraRequest {
  @ApiPropertyOptional({ maxLength: OBRA_NOME_TAMANHO_MAXIMO })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(OBRA_NOME_TAMANHO_MAXIMO)
  nome?: string;

  @ApiPropertyOptional({ maxLength: OBRA_ENDERECO_TAMANHO_MAXIMO, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(OBRA_ENDERECO_TAMANHO_MAXIMO)
  endereco?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ativa?: boolean;
}
