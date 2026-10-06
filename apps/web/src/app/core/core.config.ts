import { API_PREFIX } from '@sistema/shared';

/**
 * Todas as chamadas saem como caminho relativo. Em desenvolvimento o
 * proxy do ng serve e, em producao, o Nginx encaminham /api para a API.
 * Assim nao existe URL de back-end embutida no bundle.
 */
export const API_BASE_URL = `/${API_PREFIX}`;
