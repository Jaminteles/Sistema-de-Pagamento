import { Injectable } from '@nestjs/common';
import type { AbrangenciaFeriado } from '@sistema/shared';
import { PrismaService } from '../common/prisma/prisma.service';

const CAMPOS_PUBLICOS = {
  id: true,
  data: true,
  descricao: true,
  abrangencia: true,
  uf: true,
  municipio: true,
  criadoEm: true,
} as const;

export interface FeriadoRegistro {
  id: string;
  data: Date;
  descricao: string;
  abrangencia: AbrangenciaFeriado;
  uf: string | null;
  municipio: string | null;
  criadoEm: Date;
}

export interface DadosFeriado {
  data: Date;
  descricao: string;
  abrangencia: AbrangenciaFeriado;
  uf: string | null;
  municipio: string | null;
}

export interface FiltroFeriados {
  ano: number;
  abrangencia?: AbrangenciaFeriado;
  busca?: string;
}

/**
 * `data` e uma coluna `date`: convertida sempre em UTC para que o dia gravado
 * seja exatamente o informado, sem deslocamento de fuso.
 */
export function dataIsoParaDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function dateParaDataIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Acesso ao banco do calendario de feriados (RF-011). */
@Injectable()
export class FeriadosRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(filtro: FiltroFeriados): Promise<FeriadoRegistro[]> {
    return this.prisma.feriado.findMany({
      where: {
        data: {
          gte: dataIsoParaDate(`${filtro.ano}-01-01`),
          lte: dataIsoParaDate(`${filtro.ano}-12-31`),
        },
        ...(filtro.abrangencia ? { abrangencia: filtro.abrangencia } : {}),
        ...(filtro.busca
          ? { descricao: { contains: filtro.busca, mode: 'insensitive' as const } }
          : {}),
      },
      select: CAMPOS_PUBLICOS,
      orderBy: [{ data: 'asc' }, { descricao: 'asc' }],
    });
  }

  buscarPorId(id: string): Promise<FeriadoRegistro | null> {
    return this.prisma.feriado.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
  }

  /** A unicidade do banco e (data, descricao); esta consulta antecipa o 409. */
  buscarPorDataEDescricao(data: Date, descricao: string): Promise<{ id: string } | null> {
    return this.prisma.feriado.findFirst({
      where: { data, descricao: { equals: descricao, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  criar(dados: DadosFeriado): Promise<FeriadoRegistro> {
    return this.prisma.feriado.create({ data: dados, select: CAMPOS_PUBLICOS });
  }

  atualizar(id: string, dados: Partial<DadosFeriado>): Promise<FeriadoRegistro> {
    return this.prisma.feriado.update({ where: { id }, data: dados, select: CAMPOS_PUBLICOS });
  }

  async remover(id: string): Promise<void> {
    await this.prisma.feriado.delete({ where: { id }, select: { id: true } });
  }

  /**
   * Carga em lote dos feriados nacionais (RF-011).
   *
   * `skipDuplicates` apoia-se na unique (data, descricao): rodar a carga duas
   * vezes nao duplica nada e nao sobrescreve o que o RH ajustou.
   */
  async criarMuitosIgnorandoExistentes(itens: readonly DadosFeriado[]): Promise<number> {
    if (itens.length === 0) {
      return 0;
    }
    const resultado = await this.prisma.feriado.createMany({
      data: [...itens],
      skipDuplicates: true,
    });
    return resultado.count;
  }
}
