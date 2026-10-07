import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { RequisicaoAutenticada, UsuarioRequisicao } from '../tipos';

/**
 * Usuario autenticado da requisicao. Sempre preferir este decorator a ler o id
 * do corpo ou da query: e o que garante o escopo por usuario e por obra.
 */
export const UsuarioAtual = createParamDecorator(
  (_dados: unknown, contexto: ExecutionContext): UsuarioRequisicao => {
    const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    if (!requisicao.usuario) {
      // Só acontece se o endpoint estiver sem o guard de JWT.
      throw new UnauthorizedException('Sessao nao autenticada.');
    }
    return requisicao.usuario;
  },
);
