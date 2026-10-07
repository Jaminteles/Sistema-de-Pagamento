import { ApiProperty } from '@nestjs/swagger';
import {
  type LoginRequest,
  SENHA_TAMANHO_MAXIMO,
  USUARIO_EMAIL_TAMANHO_MAXIMO,
} from '@sistema/shared';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto implements LoginRequest {
  @ApiProperty({ example: 'admin@empresa.com.br', maxLength: USUARIO_EMAIL_TAMANHO_MAXIMO })
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(USUARIO_EMAIL_TAMANHO_MAXIMO)
  email!: string;

  /**
   * Sem @MinLength: o tamanho minimo vale para senha nova, nao para a tentativa
   * de login. Exigir tamanho aqui so ajudaria quem tenta descobrir a politica.
   */
  @ApiProperty({ maxLength: SENHA_TAMANHO_MAXIMO, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(SENHA_TAMANHO_MAXIMO)
  senha!: string;
}
