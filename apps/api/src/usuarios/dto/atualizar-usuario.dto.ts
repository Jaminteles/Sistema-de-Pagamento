import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  type AtualizarUsuarioRequest,
  PERFIS_USUARIO,
  type PerfilUsuario,
  USUARIO_NOME_TAMANHO_MAXIMO,
} from '@sistema/shared';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Atualizacao de usuario (RF-002).
 *
 * E-mail e senha ficam de fora de proposito: o e-mail identifica o usuario no
 * login e na auditoria, e a senha tem rota propria (RF-004).
 */
export class AtualizarUsuarioDto implements AtualizarUsuarioRequest {
  @ApiPropertyOptional({ maxLength: USUARIO_NOME_TAMANHO_MAXIMO })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(USUARIO_NOME_TAMANHO_MAXIMO)
  nome?: string;

  @ApiPropertyOptional({ enum: PERFIS_USUARIO })
  @IsOptional()
  @IsIn(PERFIS_USUARIO, { message: 'Perfil invalido.' })
  perfil?: PerfilUsuario;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
