import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../../config/app.config';

/**
 * Defesa de CSRF nas rotas que usam o cookie de refresh.
 *
 * O cookie ja e SameSite=strict; este guard e a segunda camada: a requisicao so
 * passa se o Origin (ou, na falta dele, o Referer) for exatamente a origem do
 * front-end configurada em CORS_ORIGIN. Requisicao sem os dois cabecalhos
 * tambem passa, porque nao vem de navegador (teste automatizado, curl, health
 * check) e por isso nao e vetor de CSRF.
 */
@Injectable()
export class OrigemMesmaSiteGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(contexto: ExecutionContext): boolean {
    const requisicao = contexto.switchToHttp().getRequest<Request>();
    const origem = this.origemDeclarada(requisicao);

    if (origem === null) {
      return true;
    }

    if (origem !== this.config.corsOrigin) {
      throw new ForbiddenException('Origem da requisicao nao permitida.');
    }

    return true;
  }

  private origemDeclarada(requisicao: Request): string | null {
    const origin = requisicao.headers.origin;
    if (typeof origin === 'string' && origin.length > 0) {
      return origin;
    }

    const referer = requisicao.headers.referer;
    if (typeof referer === 'string' && referer.length > 0) {
      try {
        return new URL(referer).origin;
      } catch {
        // Referer fora do formato: trata como origem desconhecida, nao como ausente.
        return '';
      }
    }

    return null;
  }
}
