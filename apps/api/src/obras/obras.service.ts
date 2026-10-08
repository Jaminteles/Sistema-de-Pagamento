import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type EncarregadoObraResponse,
  type ObraResponse,
  PAGINACAO_TAMANHO_PADRAO,
  type RespostaPaginada,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import type { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import type { AtualizarObraDto } from './dto/atualizar-obra.dto';
import type { CriarObraDto } from './dto/criar-obra.dto';
import type { DefinirEncarregadosDto } from './dto/definir-encarregados.dto';
import type { ListarObrasQuery } from './dto/listar-obras.query';
import { EscopoObraService } from './escopo-obra.service';
import { type ObraRegistro, ObrasRepository } from './obras.repository';

function paraResposta(registro: ObraRegistro): ObraResponse {
  return {
    id: registro.id,
    nome: registro.nome,
    endereco: registro.endereco,
    ativa: registro.ativa,
    criadoEm: registro.criadoEm.toISOString(),
    atualizadoEm: registro.atualizadoEm.toISOString(),
  };
}

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
 * Cadastro de obras/setores (RF-008) e vinculo de encarregados (RF-003).
 *
 * Pela matriz da secao 3, cadastrar obra e de ADMIN e RH. O ENCARREGADO apenas
 * consulta, e so as obras dele (RN-05): o recorte sai do EscopoObraService, a
 * partir do usuario autenticado.
 */
@Injectable()
export class ObrasService {
  constructor(
    private readonly repositorio: ObrasRepository,
    private readonly escopo: EscopoObraService,
  ) {}

  async listar(
    query: ListarObrasQuery,
    usuario: UsuarioRequisicao,
  ): Promise<RespostaPaginada<ObraResponse>> {
    const pagina = query.pagina ?? 1;
    const tamanho = query.tamanho ?? PAGINACAO_TAMANHO_PADRAO;
    const obrasPermitidas = await this.escopo.obrasPermitidas(usuario);

    // Encarregado sem vinculo nao ve obra nenhuma; evita ida ao banco.
    if (obrasPermitidas !== null && obrasPermitidas.length === 0) {
      return { itens: [], total: 0, pagina, tamanho };
    }

    const { itens, total } = await this.repositorio.listar({
      ...(query.busca ? { busca: query.busca.trim() } : {}),
      ...(query.ativa === undefined ? {} : { ativa: query.ativa }),
      ...(obrasPermitidas === null ? {} : { obrasPermitidas }),
      pular: (pagina - 1) * tamanho,
      limite: tamanho,
    });

    return { itens: itens.map(paraResposta), total, pagina, tamanho };
  }

  async buscar(id: string, usuario: UsuarioRequisicao): Promise<ObraResponse> {
    await this.escopo.garantirAcessoAObra(usuario, id);

    const obra = await this.repositorio.buscarPorId(id);
    if (!obra) {
      throw new NotFoundException('Obra nao encontrada.');
    }
    return paraResposta(obra);
  }

  async criar(dto: CriarObraDto): Promise<ObraResponse> {
    const nome = dto.nome.trim();

    if (await this.repositorio.buscarPorNome(nome)) {
      throw new ConflictException('Ja existe uma obra com este nome.');
    }

    const criada = await this.repositorio.criar({
      nome,
      endereco: textoOpcional(dto.endereco) ?? null,
    });

    return paraResposta(criada);
  }

  async atualizar(id: string, dto: AtualizarObraDto): Promise<ObraResponse> {
    const atual = await this.repositorio.buscarPorId(id);
    if (!atual) {
      throw new NotFoundException('Obra nao encontrada.');
    }

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo para alterar.');
    }

    const nome = dto.nome === undefined ? undefined : dto.nome.trim();

    if (nome !== undefined && nome.toLowerCase() !== atual.nome.toLowerCase()) {
      const existente = await this.repositorio.buscarPorNome(nome);
      if (existente && existente.id !== id) {
        throw new ConflictException('Ja existe uma obra com este nome.');
      }
    }

    const endereco = textoOpcional(dto.endereco);

    const atualizada = await this.repositorio.atualizar(id, {
      ...(nome === undefined ? {} : { nome }),
      ...(endereco === undefined ? {} : { endereco }),
      ...(dto.ativa === undefined ? {} : { ativa: dto.ativa }),
    });

    return paraResposta(atualizada);
  }

  /** RF-003: encarregados vinculados a obra. */
  async listarEncarregados(id: string): Promise<EncarregadoObraResponse[]> {
    if (!(await this.repositorio.buscarPorId(id))) {
      throw new NotFoundException('Obra nao encontrada.');
    }
    return this.repositorio.encarregadosDaObra(id);
  }

  /**
   * RF-003: substitui a lista de encarregados da obra.
   *
   * So aceita usuario com perfil ENCARREGADO: o vinculo define o escopo de
   * leitura e de lancamento (RN-05), e nao serve para ampliar o acesso de outro
   * perfil. Acao sensivel, registrada no log de auditoria (RF-005) com os ids -
   * sem nome, e-mail ou qualquer dado pessoal.
   */
  async definirEncarregados(
    id: string,
    dto: DefinirEncarregadosDto,
    coletor: ColetorAuditoria,
  ): Promise<EncarregadoObraResponse[]> {
    if (!(await this.repositorio.buscarPorId(id))) {
      throw new NotFoundException('Obra nao encontrada.');
    }

    const solicitados = [...new Set(dto.usuariosIds)];
    const validos = await this.repositorio.encarregadosExistentes(solicitados);

    if (validos.length !== solicitados.length) {
      throw new BadRequestException('Vincule apenas usuarios existentes com o perfil Encarregado.');
    }

    const antes = (await this.repositorio.encarregadosDaObra(id)).map((item) => item.usuarioId);

    await this.repositorio.definirEncarregados(id, solicitados);

    coletor.anotar({
      entidadeId: id,
      antes: { encarregadosIds: [...antes].sort() },
      depois: { encarregadosIds: [...solicitados].sort() },
    });

    return this.repositorio.encarregadosDaObra(id);
  }
}
