import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';
import { origemDa } from '../../auth/origem-requisicao';
import type { RequisicaoAutenticada } from '../../auth/tipos';
import { AUDITORIA_OPCOES, type OpcoesAuditoria } from './auditoria.decorator';
import { AuditoriaService } from './auditoria.service';
import { coletorExistente } from './coletor-auditoria';

/**
 * Grava o log das acoes marcadas com @Auditar (RF-005).
 *
 * Roda apenas no caminho de sucesso: requisicao recusada por validacao, por
 * guard ou por regra de negocio nao gera registro de acao executada.
 */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditoria: AuditoriaService,
  ) {}

  intercept(contexto: ExecutionContext, next: CallHandler): Observable<unknown> {
    const opcoes = this.reflector.get<OpcoesAuditoria | undefined>(
      AUDITORIA_OPCOES,
      contexto.getHandler(),
    );

    if (!opcoes) {
      return next.handle();
    }

    const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();

    return next.handle().pipe(
      tap(() => {
        const detalhes = coletorExistente(requisicao)?.lerDetalhes() ?? {};

        if (detalhes.ignorar) {
          return;
        }

        const parametros = requisicao.params as Record<string, string | undefined>;
        const doParametro = parametros[opcoes.parametroId ?? 'id'] ?? null;

        void this.auditoria.registrar({
          usuarioId: detalhes.usuarioId ?? requisicao.usuario?.id ?? null,
          acao: opcoes.acao,
          entidade: opcoes.entidade,
          entidadeId: detalhes.entidadeId ?? doParametro,
          antes: detalhes.antes ?? null,
          depois: detalhes.depois ?? null,
          origem: origemDa(requisicao),
        });
      }),
    );
  }
}
