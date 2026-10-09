import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  type AtualizarFuncionarioRequest,
  FUNCIONARIO_CARGO_TAMANHO_MAXIMO,
  FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO,
  FUNCIONARIO_NOME_TAMANHO_MAXIMO,
  SITUACOES_FUNCIONARIO,
  type SituacaoFuncionario,
} from '@sistema/shared';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Alteracao de funcionario (RF-006).
 *
 * O CPF nao esta aqui de proposito: ele identifica a pessoa no casamento da
 * importacao de liquidos (RF-027) e no historico de ponto; trocar o numero
 * apagaria essa ligacao.
 *
 * A coerencia entre `situacao` e `desligamento` (RN-12) e validada no service.
 */
export class AtualizarFuncionarioDto implements AtualizarFuncionarioRequest {
  @ApiPropertyOptional({ maxLength: FUNCIONARIO_NOME_TAMANHO_MAXIMO })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(FUNCIONARIO_NOME_TAMANHO_MAXIMO)
  nome?: string;

  @ApiPropertyOptional({ maxLength: FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO)
  matricula?: string;

  @ApiPropertyOptional({ maxLength: FUNCIONARIO_CARGO_TAMANHO_MAXIMO, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(FUNCIONARIO_CARGO_TAMANHO_MAXIMO)
  cargo?: string | null;

  @ApiPropertyOptional({ example: '2026-11-23' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Informe a admissao no formato AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a admissao no formato AAAA-MM-DD.' })
  admissao?: string;

  @ApiPropertyOptional({ example: '2027-03-31', nullable: true })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Informe o desligamento no formato AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe o desligamento no formato AAAA-MM-DD.' })
  desligamento?: string | null;

  @ApiPropertyOptional({ enum: SITUACOES_FUNCIONARIO })
  @IsOptional()
  @IsIn(SITUACOES_FUNCIONARIO, { message: 'Situacao invalida.' })
  situacao?: SituacaoFuncionario;
}
