import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

const CAMPOS_PUBLICOS = {
  id: true,
  nome: true,
  entradaMinutos: true,
  saidaMinutos: true,
  intervaloMinutos: true,
  cargaSemanalMinutos: true,
  toleranciaMinutos: true,
  diasSemana: true,
  ativa: true,
  criadoEm: true,
  atualizadoEm: true,
} as const;

export interface JornadaRegistro {
  id: string;
  nome: string;
  entradaMinutos: number;
  saidaMinutos: number;
  intervaloMinutos: number;
  cargaSemanalMinutos: number;
  toleranciaMinutos: number;
  diasSemana: number[];
  ativa: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface FiltroJornadas {
  busca?: string;
  ativa?: boolean;
  pular: number;
  limite: number;
}

export type DadosJornada = Omit<JornadaRegistro, 'id' | 'ativa' | 'criadoEm' | 'atualizadoEm'>;

/** Acesso ao banco do modulo de jornadas (RF-009), sempre via query builder. */
@Injectable()
export class JornadasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroJornadas): Promise<{ itens: JornadaRegistro[]; total: number }> {
    const where = {
      ...(filtro.ativa === undefined ? {} : { ativa: filtro.ativa }),
      ...(filtro.busca ? { nome: { contains: filtro.busca, mode: 'insensitive' as const } } : {}),
    };

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.jornada.findMany({
        where,
        select: CAMPOS_PUBLICOS,
        orderBy: [{ nome: 'asc' }],
        skip: filtro.pular,
        take: filtro.limite,
      }),
      this.prisma.jornada.count({ where }),
    ]);

    return { itens, total };
  }

  buscarPorId(id: string): Promise<JornadaRegistro | null> {
    return this.prisma.jornada.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
  }

  buscarPorNome(nome: string): Promise<{ id: string } | null> {
    return this.prisma.jornada.findFirst({
      where: { nome: { equals: nome, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  criar(dados: DadosJornada): Promise<JornadaRegistro> {
    return this.prisma.jornada.create({ data: dados, select: CAMPOS_PUBLICOS });
  }

  atualizar(
    id: string,
    dados: Partial<DadosJornada> & { ativa?: boolean },
  ): Promise<JornadaRegistro> {
    return this.prisma.jornada.update({ where: { id }, data: dados, select: CAMPOS_PUBLICOS });
  }
}
