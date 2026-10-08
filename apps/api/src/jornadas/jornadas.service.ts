import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  duracaoEmMinutos,
  type JornadaResponse,
  JORNADA_TOLERANCIA_PADRAO_MINUTOS,
  PAGINACAO_TAMANHO_PADRAO,
  type RespostaPaginada,
} from '@sistema/shared';
import type { AtualizarJornadaDto } from './dto/atualizar-jornada.dto';
import type { CriarJornadaDto } from './dto/criar-jornada.dto';
import type { ListarJornadasQuery } from './dto/listar-jornadas.query';
import { type JornadaRegistro, JornadasRepository } from './jornadas.repository';

function paraResposta(registro: JornadaRegistro): JornadaResponse {
  return {
    id: registro.id,
    nome: registro.nome,
    entradaMinutos: registro.entradaMinutos,
    saidaMinutos: registro.saidaMinutos,
    intervaloMinutos: registro.intervaloMinutos,
    cargaSemanalMinutos: registro.cargaSemanalMinutos,
    toleranciaMinutos: registro.toleranciaMinutos,
    diasSemana: [...registro.diasSemana].sort((a, b) => a - b),
    ativa: registro.ativa,
    criadoEm: registro.criadoEm.toISOString(),
    atualizadoEm: registro.atualizadoEm.toISOString(),
  };
}

/**
 * Cadastro de jornadas (RF-009).
 *
 * Horarios em minutos desde a meia-noite, no fuso de negocio (RNF-12), e
 * duracoes em minutos inteiros. A jornada aceita virada de meia-noite (turno da
 * noite): a duracao bruta e calculada com `duracaoEmMinutos`.
 *
 * Aqui so moram as consistencias do cadastro. A apuracao de horas, extras e
 * atrasos e do motor de apuracao (sprint 6).
 */
@Injectable()
export class JornadasService {
  constructor(private readonly repositorio: JornadasRepository) {}

  async listar(query: ListarJornadasQuery): Promise<RespostaPaginada<JornadaResponse>> {
    const pagina = query.pagina ?? 1;
    const tamanho = query.tamanho ?? PAGINACAO_TAMANHO_PADRAO;

    const { itens, total } = await this.repositorio.listar({
      ...(query.busca ? { busca: query.busca.trim() } : {}),
      ...(query.ativa === undefined ? {} : { ativa: query.ativa }),
      pular: (pagina - 1) * tamanho,
      limite: tamanho,
    });

    return { itens: itens.map(paraResposta), total, pagina, tamanho };
  }

  async buscar(id: string): Promise<JornadaResponse> {
    const jornada = await this.repositorio.buscarPorId(id);
    if (!jornada) {
      throw new NotFoundException('Jornada nao encontrada.');
    }
    return paraResposta(jornada);
  }

  async criar(dto: CriarJornadaDto): Promise<JornadaResponse> {
    const nome = dto.nome.trim();

    if (await this.repositorio.buscarPorNome(nome)) {
      throw new ConflictException('Ja existe uma jornada com este nome.');
    }

    const diasSemana = this.diasOrdenados(dto.diasSemana);
    const toleranciaMinutos = dto.toleranciaMinutos ?? JORNADA_TOLERANCIA_PADRAO_MINUTOS;

    this.validarConsistencia({
      entradaMinutos: dto.entradaMinutos,
      saidaMinutos: dto.saidaMinutos,
      intervaloMinutos: dto.intervaloMinutos,
    });

    const criada = await this.repositorio.criar({
      nome,
      entradaMinutos: dto.entradaMinutos,
      saidaMinutos: dto.saidaMinutos,
      intervaloMinutos: dto.intervaloMinutos,
      cargaSemanalMinutos: dto.cargaSemanalMinutos,
      toleranciaMinutos,
      diasSemana,
    });

    return paraResposta(criada);
  }

  async atualizar(id: string, dto: AtualizarJornadaDto): Promise<JornadaResponse> {
    const atual = await this.repositorio.buscarPorId(id);
    if (!atual) {
      throw new NotFoundException('Jornada nao encontrada.');
    }

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo para alterar.');
    }

    const nome = dto.nome === undefined ? undefined : dto.nome.trim();

    if (nome !== undefined && nome.toLowerCase() !== atual.nome.toLowerCase()) {
      const existente = await this.repositorio.buscarPorNome(nome);
      if (existente && existente.id !== id) {
        throw new ConflictException('Ja existe uma jornada com este nome.');
      }
    }

    // A consistencia e verificada sobre o resultado da alteracao, nao apenas
    // sobre os campos enviados.
    this.validarConsistencia({
      entradaMinutos: dto.entradaMinutos ?? atual.entradaMinutos,
      saidaMinutos: dto.saidaMinutos ?? atual.saidaMinutos,
      intervaloMinutos: dto.intervaloMinutos ?? atual.intervaloMinutos,
    });

    const atualizada = await this.repositorio.atualizar(id, {
      ...(nome === undefined ? {} : { nome }),
      ...(dto.entradaMinutos === undefined ? {} : { entradaMinutos: dto.entradaMinutos }),
      ...(dto.saidaMinutos === undefined ? {} : { saidaMinutos: dto.saidaMinutos }),
      ...(dto.intervaloMinutos === undefined ? {} : { intervaloMinutos: dto.intervaloMinutos }),
      ...(dto.cargaSemanalMinutos === undefined
        ? {}
        : { cargaSemanalMinutos: dto.cargaSemanalMinutos }),
      ...(dto.toleranciaMinutos === undefined ? {} : { toleranciaMinutos: dto.toleranciaMinutos }),
      ...(dto.diasSemana === undefined ? {} : { diasSemana: this.diasOrdenados(dto.diasSemana) }),
      ...(dto.ativa === undefined ? {} : { ativa: dto.ativa }),
    });

    return paraResposta(atualizada);
  }

  /** Dias unicos e ordenados; a faixa 1..7 ja e garantida pelo DTO. */
  private diasOrdenados(dias: readonly number[]): number[] {
    return [...new Set(dias)].sort((a, b) => a - b);
  }

  /**
   * Entrada e saida nao podem coincidir (duracao zero) e o intervalo precisa
   * caber dentro da jornada - senao a apuracao receberia uma jornada negativa.
   */
  private validarConsistencia(valores: {
    entradaMinutos: number;
    saidaMinutos: number;
    intervaloMinutos: number;
  }): void {
    const bruta = duracaoEmMinutos(valores.entradaMinutos, valores.saidaMinutos);

    if (bruta === 0) {
      throw new BadRequestException('A saida precisa ser diferente da entrada.');
    }

    if (valores.intervaloMinutos >= bruta) {
      throw new BadRequestException('O intervalo precisa ser menor que a duracao da jornada.');
    }
  }
}
