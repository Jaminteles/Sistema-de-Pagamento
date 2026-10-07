import { ApiProperty } from '@nestjs/swagger';
import {
  SENHA_TAMANHO_MAXIMO,
  SENHA_TAMANHO_MINIMO,
  type TrocarSenhaRequest,
} from '@sistema/shared';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class TrocarSenhaDto implements TrocarSenhaRequest {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(SENHA_TAMANHO_MAXIMO)
  senhaAtual!: string;

  @ApiProperty({
    minLength: SENHA_TAMANHO_MINIMO,
    maxLength: SENHA_TAMANHO_MAXIMO,
    writeOnly: true,
  })
  @IsString()
  @MinLength(SENHA_TAMANHO_MINIMO, {
    message: `A nova senha precisa de pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`,
  })
  @MaxLength(SENHA_TAMANHO_MAXIMO)
  novaSenha!: string;
}
