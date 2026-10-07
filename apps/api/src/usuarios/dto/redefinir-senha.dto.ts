import { ApiProperty } from '@nestjs/swagger';
import {
  type RedefinirSenhaRequest,
  SENHA_TAMANHO_MAXIMO,
  SENHA_TAMANHO_MINIMO,
} from '@sistema/shared';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Redefinicao de senha pelo administrador (RF-004).
 *
 * O administrador define a senha e a combina com o usuario por fora do sistema:
 * o projeto nao tem envio de e-mail, e a senha nunca volta na resposta da API.
 */
export class RedefinirSenhaDto implements RedefinirSenhaRequest {
  @ApiProperty({
    minLength: SENHA_TAMANHO_MINIMO,
    maxLength: SENHA_TAMANHO_MAXIMO,
    writeOnly: true,
  })
  @IsString()
  @MinLength(SENHA_TAMANHO_MINIMO, {
    message: `A senha precisa de pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`,
  })
  @MaxLength(SENHA_TAMANHO_MAXIMO)
  novaSenha!: string;
}
