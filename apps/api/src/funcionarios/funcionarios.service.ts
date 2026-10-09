import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  apenasDigitos,
  type FuncionarioResponse,
  PAGINACAO_TAMANHO_PADRAO,
  type RespostaPaginada,
  SituacaoFuncionario,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import { dataIsoParaDate } from '../common/data/data-iso';
import type { AtualizarFuncionarioDto } from './dto/atualizar-funcionario.dto';
import type { CriarFuncionarioDto } from './dto/criar-funcionario.dto';
import type { ListarFuncionariosQuery } from './dto/listar-funcionarios.query';
import { EscopoFuncionarioService } from './escopo-funcionario.service';
import {
  hojeNoFusoDeNegocio,
  paraFuncionarioResponse,
  podeVerDadoCompleto,
} from './funcionario.resposta';
import {
  type AlteracaoFuncionario,
  type FuncionarioRegistro,
  FuncionariosRepository,
} from './funcionarios.repository';

/** Texto opcional: string vazia vira null, para nao gravar "" no banco. */
function textoOpcional(valor: string | null | undefined): string | null | undefined {
  if (valor === undefined) {
    return undefined;
  }
  if (valor === null) {
    return null;
  }
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Cadastro de funcionarios (RF-006).
 *
 * Pela matriz da secao 3, cadastrar funcionario e de ADMIN e RH. O ENCARREGADO
 * e o FINANCEIRO apenas consultam, e o encarregado so alcanca quem tem vinculo
 * com as obras dele (RN-05): o recorte sai do EscopoFuncionarioService, a
 * partir do usuario autenticado.
 *
 * O funcionario NAO e usuario do sistema: aqui nao existe senha, login nem
 * qualquer rota de autoatendimento.
 */
@Injectable()
export class FuncionariosService {
  constructor(
    private readonly repositorio: FuncionariosRepository,
    private readonly escopo: EscopoFuncionarioService,
  ) {}

  async listar(
    query: ListarFuncionariosQuery,
    usuario: UsuarioRequisicao,
  ): Promise<RespostaPaginada<FuncionarioResponse>> {
    const pagina = query.pagina ?? 1;
    const tamanho = query.tamanho ?? PAGINACAO_TAMANHO_PADRAO;
    const vazio: RespostaPaginada<FuncionarioResponse> = { itens: [], total: 0, pagina, tamanho };

    const permitidas = await this.escopo.obrasPermitidas(usuario);

    // Encarregado sem vinculo nao alcanca ninguem; evita ida ao banco.
    if (permitidas !== null && permitidas.length === 0) {
      return vazio;
    }

    // O filtro de obra do cliente nunca amplia o escopo: pedir uma obra fora
    // das permitidas resulta em lista vazia, nao em acesso.
    if (query.obraId !== undefined && permitidas !== null && !permitidas.includes(query.obraId)) {
      return vazio;
    }

    const busca = query.busca?.trim();
    const digitosDaBusca = busca ? apenasDigitos(busca) : '';

    const { itens, total } = await this.repositorio.listar({
      ...(busca ? { busca } : {}),
      // CPF e guardado so com digitos: "123.456" vira "123456" para casar.
      ...(digitosDaBusca.length >= 3 ? { buscaCpf: digitosDaBusca } : {}),
      ...(query.situacao ? { situacao: query.situacao } : {}),
      ...(query.obraId ? { obraId: query.obraId } : {}),
      ...(query.comVinculoVigente ? { comVinculoVigente: true } : {}),
      ...(permitidas === null ? {} : { obrasPermitidas: permitidas }),
      referencia: hojeNoFusoDeNegocio(),
      pular: (pagina - 1) * tamanho,
      limite: tamanho,
    });

    const completo = podeVerDadoCompleto(usuario);

    return {
      itens: itens.map((item) => paraFuncionarioResponse(item, completo)),
      total,
      pagina,
      tamanho,
    };
  }

  async buscar(id: string, usuario: UsuarioRequisicao): Promise<FuncionarioResponse> {
    const funcionario = await this.exigirAcesso(id, usuario);
    return paraFuncionarioResponse(funcionario, podeVerDadoCompleto(usuario));
  }

  async criar(dto: CriarFuncionarioDto, usuario: UsuarioRequisicao): Promise<FuncionarioResponse> {
    const cpf = apenasDigitos(dto.cpf);
    const matricula = dto.matricula.trim();

    if (await this.repositorio.buscarPorCpf(cpf)) {
      throw new ConflictException('Ja existe funcionario com este CPF.');
    }
    if (await this.repositorio.buscarPorMatricula(matricula)) {
      throw new ConflictException('Ja existe funcionario com esta matricula.');
    }

    const criado = await this.repositorio.criar(
      {
        nome: dto.nome.trim(),
        cpf,
        matricula,
        cargo: textoOpcional(dto.cargo) ?? null,
        admissao: dataIsoParaDate(dto.admissao),
      },
      hojeNoFusoDeNegocio(),
    );

    return paraFuncionarioResponse(criado, podeVerDadoCompleto(usuario));
  }

  async atualizar(
    id: string,
    dto: AtualizarFuncionarioDto,
    usuario: UsuarioRequisicao,
  ): Promise<FuncionarioResponse> {
    const atual = await this.exigirAcesso(id, usuario);

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo para alterar.');
    }

    const matricula = dto.matricula === undefined ? undefined : dto.matricula.trim();

    if (matricula !== undefined && matricula.toLowerCase() !== atual.matricula.toLowerCase()) {
      const existente = await this.repositorio.buscarPorMatricula(matricula);
      if (existente && existente.id !== id) {
        throw new ConflictException('Ja existe funcionario com esta matricula.');
      }
    }

    const alteracoes: AlteracaoFuncionario = {
      ...(dto.nome === undefined ? {} : { nome: dto.nome.trim() }),
      ...(matricula === undefined ? {} : { matricula }),
      ...(dto.cargo === undefined ? {} : { cargo: textoOpcional(dto.cargo) ?? null }),
      ...(dto.admissao === undefined ? {} : { admissao: dataIsoParaDate(dto.admissao) }),
      ...(dto.desligamento === undefined
        ? {}
        : {
            desligamento: dto.desligamento === null ? null : dataIsoParaDate(dto.desligamento),
          }),
      ...(dto.situacao === undefined ? {} : { situacao: dto.situacao }),
    };

    this.validarCoerencia(atual, alteracoes);

    const atualizado = await this.repositorio.atualizar(id, alteracoes, hojeNoFusoDeNegocio());
    return paraFuncionarioResponse(atualizado, podeVerDadoCompleto(usuario));
  }

  /**
   * Carrega o funcionario aplicando o escopo do encarregado (RN-05).
   *
   * Responde 404 tanto para inexistente quanto para fora do escopo: 403
   * confirmaria o cadastro e permitiria enumerar ids pela rota.
   */
  private async exigirAcesso(
    id: string,
    usuario: UsuarioRequisicao,
  ): Promise<FuncionarioRegistro> {
    await this.escopo.garantirAcesso(usuario, id);

    const funcionario = await this.repositorio.buscarPorId(id, hojeNoFusoDeNegocio());
    if (!funcionario) {
      throw new NotFoundException('Funcionario nao encontrado.');
    }
    return funcionario;
  }

  /**
   * Coerencia entre admissao, desligamento e situacao (RN-12).
   *
   * Desligado precisa ter data de desligamento, e so o desligado pode ter uma:
   * sem isso, a apuracao nao sabe a partir de quando o funcionario deixa de
   * receber lancamento.
   */
  private validarCoerencia(atual: FuncionarioRegistro, alteracoes: AlteracaoFuncionario): void {
    const admissao = alteracoes.admissao ?? atual.admissao;
    const desligamento =
      alteracoes.desligamento === undefined ? atual.desligamento : alteracoes.desligamento;
    const situacao = alteracoes.situacao ?? atual.situacao;

    if (desligamento !== null && desligamento < admissao) {
      throw new BadRequestException('O desligamento nao pode ser anterior a admissao.');
    }

    if (situacao === SituacaoFuncionario.DESLIGADO && desligamento === null) {
      throw new BadRequestException('Informe a data de desligamento ao desligar o funcionario.');
    }

    if (situacao !== SituacaoFuncionario.DESLIGADO && desligamento !== null) {
      throw new BadRequestException(
        'Funcionario com data de desligamento precisa ficar na situacao Desligado.',
      );
    }
  }
}
