import { SetMetadata } from '@nestjs/common';

export const ROTA_PUBLICA = 'rota_publica';

/**
 * Libera a rota dos guards globais de JWT e de perfil.
 *
 * Use apenas em login, refresh e health. Qualquer outro endpoint sem
 * @Publico() e sem @Perfis() e recusado com 403 (o guard de perfil falha
 * fechado de proposito).
 */
export const Publico = (): MethodDecorator & ClassDecorator => SetMetadata(ROTA_PUBLICA, true);
