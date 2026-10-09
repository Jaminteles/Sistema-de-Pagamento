import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type CriarFuncionarioRequest,
  FUNCIONARIO_CARGO_TAMANHO_MAXIMO,
  FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO,
  FUNCIONARIO_NOME_TAMANHO_MAXIMO,
} from '@sistema/shared';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { EhCpf } from '../../common/validators/cpf.validator';

/**
 * Cadastro de funcionario (RF-006).
 *
 * `situacao` e `desligamento` nao entram: funcionario novo nasce ATIVO e sem
 * desligamento (RN-12). Com whitelist e forbidNonWhitelisted no ValidationPipe,
 * campo extra no corpo derruba a requisicao - e a protecao contra mass
 * assignment.
 */
export class CriarFuncionarioDto implements CriarFuncionarioRequest {
  @ApiProperty({ maxLength: FUNCIONARIO_NOME_TAMANHO_MAXIMO })
  @IsString()
  @MinLength(3)
  @MaxLength(FUNCIONARIO_NOME_TAMANHO_MAXIMO)
  nome!: string;

  @ApiProperty({
    example: '123.456.789-01',
    description: 'Com ou sem pontuacao; a API guarda somente os digitos.',
  })
  @IsString()
  @MaxLength(20)
  @EhCpf({ message: 'Informe um CPF valido.' })
  cpf!: string;

  @ApiProperty({ maxLength: FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO })
  @IsString()
  @MinLength(1)
  @MaxLength(FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO)
  matricula!: string;

  @ApiPropertyOptional({ maxLength: FUNCIONARIO_CARGO_TAMANHO_MAXIMO, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(FUNCIONARIO_CARGO_TAMANHO_MAXIMO)
  cargo?: string | null;

  @ApiProperty({ example: '2026-11-23', description: 'Data de admissao em AAAA-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'Informe a admissao no formato AAAA-MM-DD.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a admissao no formato AAAA-MM-DD.' })
  admissao!: string;
}
