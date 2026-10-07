import { ApiProperty } from '@nestjs/swagger';
import {
  type CriarUsuarioRequest,
  PERFIS_USUARIO,
  type PerfilUsuario,
  SENHA_TAMANHO_MAXIMO,
  SENHA_TAMANHO_MINIMO,
  USUARIO_EMAIL_TAMANHO_MAXIMO,
  USUARIO_NOME_TAMANHO_MAXIMO,
} from '@sistema/shared';
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Criacao de usuario (RF-002).
 *
 * `ativo` nao entra: usuario novo nasce ativo. Mudar isso e PATCH, auditado.
 * Com whitelist + forbidNonWhitelisted no ValidationPipe, campo extra no corpo
 * derruba a requisicao - e a protecao contra mass assignment.
 */
export class CriarUsuarioDto implements CriarUsuarioRequest {
  @ApiProperty({ maxLength: USUARIO_NOME_TAMANHO_MAXIMO })
  @IsString()
  @MinLength(3)
  @MaxLength(USUARIO_NOME_TAMANHO_MAXIMO)
  nome!: string;

  @ApiProperty({ maxLength: USUARIO_EMAIL_TAMANHO_MAXIMO })
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  @MaxLength(USUARIO_EMAIL_TAMANHO_MAXIMO)
  email!: string;

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
  senha!: string;

  @ApiProperty({ enum: PERFIS_USUARIO })
  @IsIn(PERFIS_USUARIO, { message: 'Perfil invalido.' })
  perfil!: PerfilUsuario;
}
