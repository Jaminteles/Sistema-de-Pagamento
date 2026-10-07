import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload } from '@sistema/shared';
import { AppConfig } from '../../config/app.config';
import { ROTA_PUBLICA } from '../decorators/publico.decorator';
import { SessaoService } from '../sessao.service';
import type { RequisicaoAutenticada } from '../tipos';

const MENSAGEM = 'Sessao nao autenticada.';

/**
 * Guard global de JWT. Todo endpoint exige access token valido, exceto os
 * marcados com @Publico() (login, refresh e health).
 *
 * Alem da assinatura, confere que a sessao de origem continua ativa e que o
 * usuario continua ativo: logout, troca de senha e desativacao passam a valer
 * imediatamente, sem esperar a expiracao do access token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly sessoes: SessaoService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    if (publica) {
      return true;
    }

    const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const token = this.lerToken(requisicao.headers.authorization);

    if (!token) {
      throw new UnauthorizedException(MENSAGEM);
    }

    const payload = await this.verificar(token);
    const contexto_ = await this.sessoes.contextoDaSessao(payload.sid);

    // Sessao revogada, expirada ou conta desativada: o token para de valer ja.
    if (!contexto_ || contexto_.usuarioId !== payload.sub) {
      throw new UnauthorizedException(MENSAGEM);
    }

    requisicao.usuario = {
      id: contexto_.usuarioId,
      perfil: contexto_.perfil,
      sessaoId: payload.sid,
    };
    return true;
  }

  private lerToken(authorization: string | undefined): string | null {
    if (!authorization) {
      return null;
    }
    const [esquema, valor] = authorization.split(' ');
    return esquema?.toLowerCase() === 'bearer' && valor ? valor : null;
  }

  private async verificar(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwtAccessSecret,
      });

      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
        throw new UnauthorizedException(MENSAGEM);
      }

      return payload;
    } catch {
      // A mensagem do jsonwebtoken nunca chega ao cliente.
      throw new UnauthorizedException(MENSAGEM);
    }
  }
}
