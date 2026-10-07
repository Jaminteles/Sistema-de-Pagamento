import { SetMetadata } from '@nestjs/common';
import type { PerfilUsuario } from '@sistema/shared';

export const PERFIS_PERMITIDOS = 'perfis_permitidos';

/**
 * Perfis autorizados no endpoint, conforme a matriz da secao 3 do
 * Levantamento de Requisitos. Esconder menu no front-end nao substitui isto.
 */
export const Perfis = (...perfis: PerfilUsuario[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERFIS_PERMITIDOS, perfis);
