import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { VinculoFuncionarioResponse } from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import { dataIsoParaDate, dateParaDataIso } from '../common/data/data-iso';
import { JornadasRepository } from '../jornadas/jornadas.repository';
import { ObrasRepository } from '../obras/obras.repository';
import type { AtualizarVinculoDto } from './dto/atualizar-vinculo.dto';
import type { CriarVinculoDto } from './dto/criar-vinculo.dto';
import { EscopoFuncionarioService } from './escopo-funcionario.service';
import { hojeNoFusoDeNegocio, paraVinculoResponse } from './funcionario.resposta';
import {
  type DadosVinculo,
  FuncionariosRepository,
  type VinculoRegistro,
} from './funcionarios.repository';

/** Intervalo de vigencia; `fim` nulo significa aberto (sem data de termino). */
interface Vigencia {
  inicio: Date;
  fim: Date | null;
}

/**
 * Dois intervalos se sobrepoem quando cada um comeca antes (ou no dia) do fim
 * do outro. Vigencia aberta e tratada como fim no infinito.
 */
function sobrepoe(a: Vigencia, b: Vigencia): boolean {
  const antesDoFimDeB = b.fim === null || a.inicio <= b.fim;
  const antesDoFimDeA = a.fim === null || b.inicio <= a.fim;
  return antesDoFimDeB && antesDoFimDeA;
}

/**
 * Vinculo do funcionario a obra e jornada, com vigencia (RF-010).
 *
 * O vinculo e o que liga o funcionario ao escopo do encarregado (RN-05) e a
 * jornada usada pela apuracao, por isso as vigencias nao podem se sobrepor:
 * em um dia qualquer o motor de apuracao precisa achar exatamente uma jornada.
 *
 * Pela matriz da secao 3, criar e alterar vinculo e de ADMIN e RH.
 */
@Injectable()
export class VinculosService {
  constructor(
    private readonly repositorio: FuncionariosRepository,
    private readonly escopo: EscopoFuncionarioService,
    private readonly obras: ObrasRepository,
    private readonly jornadas: JornadasRepository,
  ) {}

  async listar(
    funcionarioId: string,
    usuario: UsuarioRequisicao,
  ): Promise<VinculoFuncionarioResponse[]> {
    await this.exigirFuncionario(funcionarioId, usuario);
    const itens = await this.repositorio.listarVinculos(funcionarioId);
    return itens.map(paraVinculoResponse);
  }

  async criar(
    funcionarioId: string,
    dto: CriarVinculoDto,
    usuario: UsuarioRequisicao,
  ): Promise<VinculoFuncionarioResponse> {
    const funcionario = await this.exigirFuncionario(funcionarioId, usuario);

    const dados: DadosVinculo = {
      obraId: dto.obraId,
      jornadaId: dto.jornadaId,
      inicioVigencia: dataIsoParaDate(dto.inicioVigencia),
      fimVigencia: dto.fimVigencia ? dataIsoParaDate(dto.fimVigencia) : null,
    };

    await this.validar(funcionario.admissao, dados);

    const existentes = await this.repositorio.listarVinculos(funcionarioId);
    this.garantirSemSobreposicao(dados, existentes, null);

    const criado = await this.repositorio.criarVinculo(funcionarioId, dados);
    return paraVinculoResponse(criado);
  }

  async atualizar(
    funcionarioId: string,
    vinculoId: string,
    dto: AtualizarVinculoDto,
    usuario: UsuarioRequisicao,
  ): Promise<VinculoFuncionarioResponse> {
    const funcionario = await this.exigirFuncionario(funcionarioId, usuario);

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo para alterar.');
    }

    const atual = await this.repositorio.buscarVinculo(vinculoId);
    // Vinculo de outro funcionario responde 404: o id do funcionario na rota e
    // o que passou pelo escopo, e nao o id do vinculo no corpo.
    if (!atual || atual.funcionarioId !== funcionarioId) {
      throw new NotFoundException('Vinculo nao encontrado.');
    }

    const dados: DadosVinculo = {
      obraId: dto.obraId ?? atual.obraId,
      jornadaId: dto.jornadaId ?? atual.jornadaId,
      inicioVigencia:
        dto.inicioVigencia === undefined
          ? atual.inicioVigencia
          : dataIsoParaDate(dto.inicioVigencia),
      fimVigencia:
        dto.fimVigencia === undefined
          ? atual.fimVigencia
          : dto.fimVigencia === null
            ? null
            : dataIsoParaDate(dto.fimVigencia),
    };

    await this.validar(funcionario.admissao, dados);

    const existentes = await this.repositorio.listarVinculos(funcionarioId);
    this.garantirSemSobreposicao(dados, existentes, vinculoId);

    const atualizado = await this.repositorio.atualizarVinculo(vinculoId, dados);
    return paraVinculoResponse(atualizado);
  }

  /** Funcionario existente e dentro do escopo do usuario (RN-05). */
  private async exigirFuncionario(
    funcionarioId: string,
    usuario: UsuarioRequisicao,
  ): Promise<{ admissao: Date }> {
    await this.escopo.garantirAcesso(usuario, funcionarioId);

    const funcionario = await this.repositorio.buscarPorId(funcionarioId, hojeNoFusoDeNegocio());
    if (!funcionario) {
      throw new NotFoundException('Funcionario nao encontrado.');
    }
    return funcionario;
  }

  /**
   * Obra e jornada existentes e ativas, vigencia coerente e inicio nao anterior
   * a admissao.
   */
  private async validar(admissao: Date, dados: DadosVinculo): Promise<void> {
    if (dados.fimVigencia !== null && dados.fimVigencia < dados.inicioVigencia) {
      throw new BadRequestException('O fim da vigencia nao pode ser anterior ao inicio.');
    }

    if (dados.inicioVigencia < admissao) {
      throw new BadRequestException(
        `O vinculo nao pode comecar antes da admissao (${dateParaDataIso(admissao)}).`,
      );
    }

    const obra = await this.obras.buscarPorId(dados.obraId);
    if (!obra) {
      throw new BadRequestException('Obra nao encontrada.');
    }
    if (!obra.ativa) {
      throw new BadRequestException('Obra inativa nao recebe novo vinculo.');
    }

    const jornada = await this.jornadas.buscarPorId(dados.jornadaId);
    if (!jornada) {
      throw new BadRequestException('Jornada nao encontrada.');
    }
    if (!jornada.ativa) {
      throw new BadRequestException('Jornada inativa nao recebe novo vinculo.');
    }
  }

  /**
   * Recusa vigencias sobrepostas. Cobre tambem o caso de dois vinculos abertos,
   * que o indice parcial unico do banco ja impede - a mensagem daqui e a util.
   */
  private garantirSemSobreposicao(
    dados: DadosVinculo,
    existentes: readonly VinculoRegistro[],
    ignorarId: string | null,
  ): void {
    const novo: Vigencia = { inicio: dados.inicioVigencia, fim: dados.fimVigencia };

    const conflito = existentes.find(
      (item) =>
        item.id !== ignorarId &&
        sobrepoe(novo, { inicio: item.inicioVigencia, fim: item.fimVigencia }),
    );

    if (conflito) {
      const fim = conflito.fimVigencia ? dateParaDataIso(conflito.fimVigencia) : 'em aberto';
      throw new ConflictException(
        `A vigencia se sobrepoe ao vinculo de ${dateParaDataIso(conflito.inicioVigencia)} ate ${fim}. ` +
          'Encerre o vinculo anterior antes de abrir outro.',
      );
    }
  }
}
