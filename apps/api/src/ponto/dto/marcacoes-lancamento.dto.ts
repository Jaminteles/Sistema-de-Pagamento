import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  type MarcacoesLancamentoRequest,
  OCORRENCIAS_DIA,
  type OcorrenciaDia,
} from '@sistema/shared';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** "HH:MM" em 24 horas. */
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Campos comuns do lancamento de um dia, usados pela grade por equipe (RF-013)
 * e pela tela por funcionario (RF-014).
 *
 * Campo ausente mantem o que esta gravado; `null` apaga a marcacao. E essa
 * diferenca que permite a grade enviar somente o que o encarregado digitou, sem
 * apagar por omissao o que o RH ja havia corrigido.
 */
export class MarcacoesLancamentoDto implements MarcacoesLancamentoRequest {
  @ApiPropertyOptional({ example: '07:00', nullable: true, description: 'HH:MM; null apaga' })
  @IsOptional()
  @Matches(HORA, { message: 'Informe a entrada em HH:MM.' })
  entrada?: string | null;

  @ApiPropertyOptional({ example: '11:00', nullable: true })
  @IsOptional()
  @Matches(HORA, { message: 'Informe a saida do intervalo em HH:MM.' })
  saidaIntervalo?: string | null;

  @ApiPropertyOptional({ example: '12:00', nullable: true })
  @IsOptional()
  @Matches(HORA, { message: 'Informe o retorno do intervalo em HH:MM.' })
  retornoIntervalo?: string | null;

  @ApiPropertyOptional({ example: '17:00', nullable: true })
  @IsOptional()
  @Matches(HORA, { message: 'Informe a saida em HH:MM.' })
  saida?: string | null;

  @ApiPropertyOptional({
    enum: OCORRENCIAS_DIA,
    description: 'RF-015; diferente de NORMAL apaga as marcacoes',
  })
  @IsOptional()
  @IsIn(OCORRENCIAS_DIA, { message: 'Ocorrencia invalida.' })
  ocorrencia?: OcorrenciaDia;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string | null;
}
