import { Injectable, NotFoundException } from '@nestjs/common';
import { PerfilUsuario } from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import { ObrasRepository } from './obras.repository';

/**
 * Escopo por obra do encarregado (RN-05).
 *
 * Unico lugar que decide "quais obras este usuario alcanca". A lista sai sempre
 * do banco a partir do id do usuario autenticado - nunca de id, corpo ou query
 * enviados pelo cliente, que e exatamente o que impede IDOR.
 *
 * As consultas de ponto, funcionario e relatorio das proximas sprints devem
 * passar por aqui em vez de refazer o filtro.
 */
@Injectable()
export class EscopoObraService {
  constructor(private readonly obras: ObrasRepository) {}

  /** Verdadeiro quando o perfil enxerga somente as obras vinculadas a ele. */
  temEscopoRestrito(usuario: UsuarioRequisicao): boolean {
    return usuario.perfil === PerfilUsuario.ENCARREGADO;
  }

  /**
   * Obras que o usuario alcanca, ou `null` quando o perfil nao tem restricao
   * (ADMIN, RH e FINANCEIRO, conforme a secao 3 do Levantamento de Requisitos).
   *
   * Lista vazia e diferente de `null`: o encarregado sem vinculo nao alcanca
   * obra nenhuma.
   */
  async obrasPermitidas(usuario: UsuarioRequisicao): Promise<string[] | null> {
    if (!this.temEscopoRestrito(usuario)) {
      return null;
    }
    return this.obras.obrasDoUsuario(usuario.id);
  }

  /**
   * Interrompe a requisicao quando a obra esta fora do escopo do usuario.
   *
   * Responde 404 (e nao 403) de proposito: 403 confirmaria a existencia da obra
   * e permitiria enumerar ids pela rota.
   */
  async garantirAcessoAObra(usuario: UsuarioRequisicao, obraId: string): Promise<void> {
    const permitidas = await this.obrasPermitidas(usuario);
    if (permitidas !== null && !permitidas.includes(obraId)) {
      throw new NotFoundException('Obra nao encontrada.');
    }
  }
}
