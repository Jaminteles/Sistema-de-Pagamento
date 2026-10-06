/**
 * Perfis fixos do sistema (secao 3 do Levantamento de Requisitos).
 * O funcionario NAO e usuario e nao possui perfil.
 *
 * Os valores precisam ser identicos ao enum PerfilUsuario de apps/api/prisma/schema.prisma.
 */
export const PerfilUsuario = {
  ADMIN: 'ADMIN',
  RH: 'RH',
  ENCARREGADO: 'ENCARREGADO',
  FINANCEIRO: 'FINANCEIRO',
} as const;

export type PerfilUsuario = (typeof PerfilUsuario)[keyof typeof PerfilUsuario];

export const PERFIS_USUARIO: readonly PerfilUsuario[] = Object.values(PerfilUsuario);

/** Rotulos para exibicao no front-end. */
export const PERFIL_USUARIO_LABEL: Readonly<Record<PerfilUsuario, string>> = {
  ADMIN: 'Administrador',
  RH: 'RH',
  ENCARREGADO: 'Encarregado',
  FINANCEIRO: 'Financeiro',
};
