import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PerfilUsuario } from '@sistema/shared';
import { PERFIS_PERMITIDOS } from '../decorators/perfis.decorator';
import { ROTA_PUBLICA } from '../decorators/publico.decorator';
import type { RequisicaoAutenticada } from '../tipos';

/**
 * Guard global de perfil, segunda metade da regra "todo endpoint tem guard de
 * JWT e guard de perfil".
 *
 * Falha fechado de proposito: endpoint que nao declarar @Publico() nem
 * @Perfis(...) e recusado com 403. Esquecer o decorator quebra o endpoint em
 * teste, em vez de abrir acesso em producao.
 *
 * A matriz oficial e a secao 3 do Levantamento de Requisitos. O escopo por obra
 * do encarregado (RN-05) nao e tratado aqui: ele e aplicado no service, a partir
 * do usuario autenticado.
 */
@Injectable()
export class PerfisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const alvos = [contexto.getHandler(), contexto.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, alvos)) {
      return true;
    }

    const permitidos = this.reflector.getAllAndOverride<PerfilUsuario[]>(PERFIS_PERMITIDOS, alvos);
    const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const usuario = requisicao.usuario;

    if (!usuario) {
      throw new UnauthorizedException('Sessao nao autenticada.');
    }

    if (!permitidos || permitidos.length === 0) {
      throw new ForbiddenException('Acesso nao permitido para o seu perfil.');
    }

    if (!permitidos.includes(usuario.perfil)) {
      throw new ForbiddenException('Acesso nao permitido para o seu perfil.');
    }

    return true;
  }
}
