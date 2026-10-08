import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AbrangenciaFeriado,
  type CarregarFeriadosNacionaisResponse,
  type FeriadoResponse,
  TIMEZONE_NEGOCIO,
} from '@sistema/shared';
import type { AtualizarFeriadoDto } from './dto/atualizar-feriado.dto';
import type { CarregarFeriadosNacionaisDto } from './dto/carregar-feriados-nacionais.dto';
import type { CriarFeriadoDto } from './dto/criar-feriado.dto';
import type { ListarFeriadosQuery } from './dto/listar-feriados.query';
import { feriadosNacionais } from './feriados-nacionais';
import {
  dataIsoParaDate,
  dateParaDataIso,
  type DadosFeriado,
  type FeriadoRegistro,
  FeriadosRepository,
} from './feriados.repository';

function paraResposta(registro: FeriadoRegistro): FeriadoResponse {
  return {
    id: registro.id,
    data: dateParaDataIso(registro.data),
    descricao: registro.descricao,
    abrangencia: registro.abrangencia,
    uf: registro.uf,
    municipio: registro.municipio,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

/** Ano corrente no fuso de negocio (RNF-12), nao no fuso do servidor. */
export function anoCorrente(agora: Date = new Date()): number {
  const formatador = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_NEGOCIO,
    year: 'numeric',
  });
  return Number(formatador.format(agora));
}

/**
 * Calendario de feriados (RF-011).
 *
 * Feriado afeta a apuracao (RN-03: extra a 100% em domingo e feriado), por isso
 * o cadastro exige coerencia entre abrangencia, UF e municipio. O calculo em si
 * e do motor de apuracao (sprint 6).
 */
@Injectable()
export class FeriadosService {
  constructor(private readonly repositorio: FeriadosRepository) {}

  async listar(query: ListarFeriadosQuery): Promise<FeriadoResponse[]> {
    const itens = await this.repositorio.listar({
      ano: query.ano ?? anoCorrente(),
      ...(query.abrangencia ? { abrangencia: query.abrangencia } : {}),
      ...(query.busca ? { busca: query.busca.trim() } : {}),
    });
    return itens.map(paraResposta);
  }

  async buscar(id: string): Promise<FeriadoResponse> {
    const feriado = await this.repositorio.buscarPorId(id);
    if (!feriado) {
      throw new NotFoundException('Feriado nao encontrado.');
    }
    return paraResposta(feriado);
  }

  async criar(dto: CriarFeriadoDto): Promise<FeriadoResponse> {
    const dados = this.montarDados({
      data: dto.data,
      descricao: dto.descricao,
      abrangencia: dto.abrangencia,
      uf: dto.uf,
      municipio: dto.municipio,
    });

    if (await this.repositorio.buscarPorDataEDescricao(dados.data, dados.descricao)) {
      throw new ConflictException('Ja existe um feriado com esta data e descricao.');
    }

    return paraResposta(await this.repositorio.criar(dados));
  }

  async atualizar(id: string, dto: AtualizarFeriadoDto): Promise<FeriadoResponse> {
    const atual = await this.repositorio.buscarPorId(id);
    if (!atual) {
      throw new NotFoundException('Feriado nao encontrado.');
    }

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo para alterar.');
    }

    // A coerencia e verificada sobre o resultado da alteracao: trocar so a
    // abrangencia precisa levar em conta a UF e o municipio ja gravados.
    const dados = this.montarDados({
      data: dto.data ?? dateParaDataIso(atual.data),
      descricao: dto.descricao ?? atual.descricao,
      abrangencia: dto.abrangencia ?? atual.abrangencia,
      uf: dto.uf === undefined ? atual.uf : dto.uf,
      municipio: dto.municipio === undefined ? atual.municipio : dto.municipio,
    });

    const mudouChave =
      dateParaDataIso(dados.data) !== dateParaDataIso(atual.data) ||
      dados.descricao.toLowerCase() !== atual.descricao.toLowerCase();

    if (mudouChave) {
      const existente = await this.repositorio.buscarPorDataEDescricao(dados.data, dados.descricao);
      if (existente && existente.id !== id) {
        throw new ConflictException('Ja existe um feriado com esta data e descricao.');
      }
    }

    return paraResposta(await this.repositorio.atualizar(id, dados));
  }

  async remover(id: string): Promise<void> {
    if (!(await this.repositorio.buscarPorId(id))) {
      throw new NotFoundException('Feriado nao encontrado.');
    }
    await this.repositorio.remover(id);
  }

  /**
   * Carga inicial dos feriados nacionais do ano (RF-011).
   *
   * Idempotente: repetir a carga nao duplica nem sobrescreve o que o RH
   * ajustou. Feriado estadual e municipal continuam sendo cadastro manual.
   */
  async carregarNacionais(
    dto: CarregarFeriadosNacionaisDto,
  ): Promise<CarregarFeriadosNacionaisResponse> {
    const ano = dto.ano;

    const itens: DadosFeriado[] = feriadosNacionais(ano).map((item) => ({
      data: dataIsoParaDate(item.data),
      descricao: item.descricao,
      abrangencia: AbrangenciaFeriado.NACIONAL,
      uf: null,
      municipio: null,
    }));

    const criados = await this.repositorio.criarMuitosIgnorandoExistentes(itens);

    const doAno = await this.repositorio.listar({
      ano,
      abrangencia: AbrangenciaFeriado.NACIONAL,
    });

    return {
      ano,
      criados,
      jaExistentes: itens.length - criados,
      itens: doAno.map(paraResposta),
    };
  }

  /**
   * Normaliza e valida a coerencia do feriado:
   *   - NACIONAL nao tem UF nem municipio;
   *   - ESTADUAL exige UF e nao tem municipio;
   *   - MUNICIPAL exige UF e municipio.
   */
  private montarDados(valores: {
    data: string;
    descricao: string;
    abrangencia: AbrangenciaFeriado;
    uf: string | null | undefined;
    municipio: string | null | undefined;
  }): DadosFeriado {
    const descricao = valores.descricao.trim();
    const uf = valores.uf ? valores.uf.trim().toUpperCase() : null;
    const municipio = valores.municipio ? valores.municipio.trim() : null;

    if (descricao.length === 0) {
      throw new BadRequestException('Informe a descricao do feriado.');
    }

    if (valores.abrangencia === AbrangenciaFeriado.NACIONAL && (uf || municipio)) {
      throw new BadRequestException('Feriado nacional nao tem UF nem municipio.');
    }

    if (valores.abrangencia === AbrangenciaFeriado.ESTADUAL) {
      if (!uf) {
        throw new BadRequestException('Feriado estadual exige a UF.');
      }
      if (municipio) {
        throw new BadRequestException('Feriado estadual nao tem municipio.');
      }
    }

    if (valores.abrangencia === AbrangenciaFeriado.MUNICIPAL && (!uf || !municipio)) {
      throw new BadRequestException('Feriado municipal exige a UF e o municipio.');
    }

    return {
      data: dataIsoParaDate(valores.data),
      descricao,
      abrangencia: valores.abrangencia,
      uf,
      municipio,
    };
  }
}
