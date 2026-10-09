import { Injectable, NotFoundException } from '@nestjs/common';
import type { UsuarioRequisicao } from '../auth/tipos';
import { EscopoObraService } from '../obras/escopo-obra.service';
import { FuncionariosRepository } from './funcionarios.repository';

/**
 * Escopo por obra aplicado ao funcionario (RN-05).
 *
 * O encarregado alcanca somente os funcionarios que tem vinculo com alguma das
 * obras dele. A lista de obras sai do banco a partir do id do usuario
 * autenticado - nunca de id de rota, corpo ou query -, que e o que impede IDOR.
 *
 * Considera qualquer vinculo, vigente ou encerrado: o encarregado precisa
 * continuar vendo quem trabalhou na obra dele em periodo anterior.
 */
@Injectable()
export class EscopoFuncionarioService {
  constructor(
    private readonly escopoObra: EscopoObraService,
    private readonly funcionarios: FuncionariosRepository,
  ) {}

  /** Obras do usuario, ou `null` quando o perfil nao tem restricao. */
  obrasPermitidas(usuario: UsuarioRequisicao): Promise<string[] | null> {
    return this.escopoObra.obrasPermitidas(usuario);
  }

  /**
   * Interrompe a requisicao quando o funcionario esta fora do escopo.
   *
   * Responde 404 (e nao 403) de proposito: 403 confirmaria a existencia do
   * cadastro e permitiria enumerar ids pela rota.
   */
  async garantirAcesso(usuario: UsuarioRequisicao, funcionarioId: string): Promise<void> {
    const permitidas = await this.escopoObra.obrasPermitidas(usuario);
    if (permitidas === null) {
      return;
    }

    const obras = await this.funcionarios.obrasDoFuncionario(funcionarioId);
    if (!obras.some((obra) => permitidas.includes(obra))) {
      throw new NotFoundException('Funcionario nao encontrado.');
    }
  }
}
