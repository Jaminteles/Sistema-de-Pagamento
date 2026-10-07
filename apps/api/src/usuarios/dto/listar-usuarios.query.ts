import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  type FiltroUsuarios,
  PAGINACAO_TAMANHO_MAXIMO,
  PAGINACAO_TAMANHO_PADRAO,
  PERFIS_USUARIO,
  type ParametrosPaginacao,
  type PerfilUsuario,
} from '@sistema/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Converte "true"/"false" da query string em boolean, mantendo undefined. */
const paraBoolean = (): PropertyDecorator =>
  Transform(({ value }) => {
    if (value === undefined || value === '') {
      return undefined;
    }
    return value === true || value === 'true' || value === '1';
  });

const paraInteiro = (): PropertyDecorator =>
  Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)));

/** Filtros e paginacao de GET /api/usuarios. */
export class ListarUsuariosQuery implements FiltroUsuarios, ParametrosPaginacao {
  @ApiPropertyOptional({ description: 'Busca por nome ou e-mail' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  busca?: string;

  @ApiPropertyOptional({ enum: PERFIS_USUARIO })
  @IsOptional()
  @IsIn(PERFIS_USUARIO, { message: 'Perfil invalido.' })
  perfil?: PerfilUsuario;

  @ApiPropertyOptional()
  @IsOptional()
  @paraBoolean()
  @IsBoolean()
  ativo?: boolean;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @paraInteiro()
  @IsInt()
  @Min(1)
  pagina?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PAGINACAO_TAMANHO_MAXIMO,
    default: PAGINACAO_TAMANHO_PADRAO,
  })
  @IsOptional()
  @paraInteiro()
  @IsInt()
  @Min(1)
  @Max(PAGINACAO_TAMANHO_MAXIMO)
  tamanho?: number;
}
