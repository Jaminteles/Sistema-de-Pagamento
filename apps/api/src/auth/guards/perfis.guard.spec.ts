import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PerfilUsuario } from '@sistema/shared';
import { Perfis } from '../decorators/perfis.decorator';
import { Publico } from '../decorators/publico.decorator';
import type { UsuarioRequisicao } from '../tipos';
import { PerfisGuard } from './perfis.guard';

/** Alvos de metadata reais, para o Reflector ler o que os decorators gravam. */
class RotasDeTeste {
  @Perfis(PerfilUsuario.ADMIN)
  somenteAdmin(): void {}

  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.FINANCEIRO)
  adminOuFinanceiro(): void {}

  @Publico()
  publica(): void {}

  semDecorator(): void {}
}

function contexto(
  handler: (...args: unknown[]) => unknown,
  usuario?: UsuarioRequisicao,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => RotasDeTeste,
    switchToHttp: () => ({ getRequest: () => ({ usuario }) }),
  } as unknown as ExecutionContext;
}

const admin: UsuarioRequisicao = {
  id: 'u-admin',
  perfil: PerfilUsuario.ADMIN,
  sessaoId: 's-1',
};
const rh: UsuarioRequisicao = { id: 'u-rh', perfil: PerfilUsuario.RH, sessaoId: 's-2' };
const financeiro: UsuarioRequisicao = {
  id: 'u-fin',
  perfil: PerfilUsuario.FINANCEIRO,
  sessaoId: 's-3',
};
const encarregado: UsuarioRequisicao = {
  id: 'u-enc',
  perfil: PerfilUsuario.ENCARREGADO,
  sessaoId: 's-4',
};

/*
 * eslint-disable-next-line nao serve aqui porque sao varias linhas: o Reflector
 * le a metadata gravada no proprio objeto da funcao, por isso o teste precisa da
 * referencia crua de cada metodo decorado. Nenhum deles e invocado.
 */
/* eslint-disable @typescript-eslint/unbound-method */
const rotas = {
  somenteAdmin: RotasDeTeste.prototype.somenteAdmin,
  adminOuFinanceiro: RotasDeTeste.prototype.adminOuFinanceiro,
  publica: RotasDeTeste.prototype.publica,
  semDecorator: RotasDeTeste.prototype.semDecorator,
};
/* eslint-enable @typescript-eslint/unbound-method */

describe('PerfisGuard', () => {
  const guard = new PerfisGuard(new Reflector());

  it('libera o perfil declarado', () => {
    expect(guard.canActivate(contexto(rotas.somenteAdmin, admin))).toBe(true);
    expect(guard.canActivate(contexto(rotas.adminOuFinanceiro, financeiro))).toBe(true);
  });

  it.each([
    ['RH', rh],
    ['ENCARREGADO', encarregado],
    ['FINANCEIRO', financeiro],
  ])('recusa %s em rota exclusiva do ADMIN', (_nome, usuario) => {
    expect(() => guard.canActivate(contexto(rotas.somenteAdmin, usuario))).toThrow(
      ForbiddenException,
    );
  });

  it('recusa perfil fora da lista mesmo em rota de varios perfis', () => {
    expect(() => guard.canActivate(contexto(rotas.adminOuFinanceiro, encarregado))).toThrow(
      ForbiddenException,
    );
  });

  it('libera rota marcada como publica sem exigir usuario', () => {
    expect(guard.canActivate(contexto(rotas.publica))).toBe(true);
  });

  it('falha fechado: endpoint sem @Perfis e recusado', () => {
    expect(() => guard.canActivate(contexto(rotas.semDecorator, admin))).toThrow(
      ForbiddenException,
    );
  });

  it('exige sessao autenticada antes de avaliar o perfil', () => {
    expect(() => guard.canActivate(contexto(rotas.somenteAdmin))).toThrow(UnauthorizedException);
  });

  it('nao revela quais perfis seriam aceitos na mensagem de erro', () => {
    try {
      guard.canActivate(contexto(rotas.somenteAdmin, rh));
      throw new Error('deveria ter recusado');
    } catch (erro) {
      expect((erro as ForbiddenException).message).toBe('Acesso nao permitido para o seu perfil.');
    }
  });
});
