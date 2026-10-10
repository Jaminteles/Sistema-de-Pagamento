import { Injectable } from '@nestjs/common';
import type {
  OcorrenciaDia,
  OrigemMarcacao,
  StatusEnvioDia,
  StatusPeriodo,
  TipoMarcacao,
} from '@sistema/shared';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Acesso ao banco do lancamento de ponto (RF-013 a RF-016).
 *
 * Tudo pelo query builder do Prisma, parametrizado: nenhuma consulta e montada
 * por concatenacao de string. As consultas de equipe e de periodo trazem
 * funcionario e jornada no mesmo `select`, para a grade de 30 pessoas nao virar
 * 30 idas ao banco (N+1).
 *
 * O escopo do encarregado (RN-05) nao e decidido aqui: o service informa quais
 * obras podem entrar na consulta, a partir do usuario autenticado.
 */

export interface PeriodoRegistro {
  id: string;
  competencia: string;
  dataInicio: Date;
  dataFim: Date;
  status: StatusPeriodo;
  fechadoEm: Date | null;
  reabertoEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface JornadaResumo {
  id: string;
  nome: string;
  entradaMinutos: number;
  saidaMinutos: number;
  intervaloMinutos: number;
  toleranciaMinutos: number;
  diasSemana: number[];
}

export interface MarcacaoRegistro {
  id: string;
  tipo: TipoMarcacao;
  horario: Date;
  origem: OrigemMarcacao;
}

export interface DiaPontoRegistro {
  id: string;
  periodoId: string;
  funcionarioId: string;
  data: Date;
  ocorrencia: OcorrenciaDia;
  statusEnvio: StatusEnvioDia;
  minutosTrabalhados: number;
  minutosExtras50: number;
  minutosExtras100: number;
  minutosNoturnos: number;
  minutosAtraso: number;
  minutosFalta: number;
  apuradoEm: Date | null;
  observacao: string | null;
  marcacoes: MarcacaoRegistro[];
  atualizadoEm: Date;
}

/** Vinculo com a jornada e o cadastro do funcionario resolvidos. */
export interface VinculoVigenteRegistro {
  funcionarioId: string;
  funcionarioNome: string;
  matricula: string;
  admissao: Date;
  desligamento: Date | null;
  obraId: string;
  inicioVigencia: Date;
  fimVigencia: Date | null;
  jornada: JornadaResumo;
}

export interface FeriadoDoDia {
  data: Date;
  descricao: string;
}

export interface MarcacaoGravavel {
  tipo: TipoMarcacao;
  horario: Date;
}

/**
 * Um dia de ponto a gravar.
 *
 * `marcacoes` sao gravadas por upsert em [dia, tipo] e `remover` apaga as que
 * sairam. Nao se apaga o dia inteiro para regravar: isso destruiria o id da
 * marcacao e, com ele, o historico de ajustes que a sprint 6 pendura nela
 * (RF-017).
 */
export interface LancamentoGravavel {
  periodoId: string;
  funcionarioId: string;
  data: Date;
  ocorrencia: OcorrenciaDia;
  observacao: string | null;
  marcacoes: MarcacaoGravavel[];
  remover: TipoMarcacao[];
}

export interface FiltroPeriodos {
  status?: StatusPeriodo;
  pular: number;
  limite: number;
}

const CAMPOS_PERIODO = {
  id: true,
  competencia: true,
  dataInicio: true,
  dataFim: true,
  status: true,
  fechadoEm: true,
  reabertoEm: true,
  criadoEm: true,
  atualizadoEm: true,
} as const;

const CAMPOS_JORNADA = {
  id: true,
  nome: true,
  entradaMinutos: true,
  saidaMinutos: true,
  intervaloMinutos: true,
  toleranciaMinutos: true,
  diasSemana: true,
} as const;

const CAMPOS_DIA = {
  id: true,
  periodoId: true,
  funcionarioId: true,
  data: true,
  ocorrencia: true,
  statusEnvio: true,
  minutosTrabalhados: true,
  minutosExtras50: true,
  minutosExtras100: true,
  minutosNoturnos: true,
  minutosAtraso: true,
  minutosFalta: true,
  apuradoEm: true,
  observacao: true,
  atualizadoEm: true,
  marcacoes: {
    select: { id: true, tipo: true, horario: true, origem: true },
    orderBy: { horario: 'asc' as const },
  },
} as const;

const CAMPOS_VINCULO = {
  obraId: true,
  funcionarioId: true,
  inicioVigencia: true,
  fimVigencia: true,
  funcionario: {
    select: { nome: true, matricula: true, admissao: true, desligamento: true },
  },
  jornada: { select: CAMPOS_JORNADA },
} as const;

interface VinculoBruto {
  obraId: string;
  funcionarioId: string;
  inicioVigencia: Date;
  fimVigencia: Date | null;
  funcionario: { nome: string; matricula: string; admissao: Date; desligamento: Date | null };
  jornada: JornadaResumo;
}

function paraVinculo(bruto: VinculoBruto): VinculoVigenteRegistro {
  return {
    funcionarioId: bruto.funcionarioId,
    funcionarioNome: bruto.funcionario.nome,
    matricula: bruto.funcionario.matricula,
    admissao: bruto.funcionario.admissao,
    desligamento: bruto.funcionario.desligamento,
    obraId: bruto.obraId,
    inicioVigencia: bruto.inicioVigencia,
    fimVigencia: bruto.fimVigencia,
    jornada: bruto.jornada,
  };
}

@Injectable()
export class PontoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Vigencia que cobre pelo menos um dia do intervalo pedido. */
  private vigenteNoIntervalo(inicio: Date, fim: Date) {
    return {
      inicioVigencia: { lte: fim },
      OR: [{ fimVigencia: null }, { fimVigencia: { gte: inicio } }],
    };
  }

  // -------------------------------------------------------------------------
  // RF-013 - periodo
  // -------------------------------------------------------------------------

  async listarPeriodos(
    filtro: FiltroPeriodos,
  ): Promise<{ itens: PeriodoRegistro[]; total: number }> {
    const where = filtro.status ? { status: filtro.status } : {};

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.periodo.findMany({
        where,
        select: CAMPOS_PERIODO,
        orderBy: [{ competencia: 'desc' }],
        skip: filtro.pular,
        take: filtro.limite,
      }),
      this.prisma.periodo.count({ where }),
    ]);

    return { itens, total };
  }

  buscarPeriodo(id: string): Promise<PeriodoRegistro | null> {
    return this.prisma.periodo.findUnique({ where: { id }, select: CAMPOS_PERIODO });
  }

  buscarPeriodoPorCompetencia(competencia: string): Promise<PeriodoRegistro | null> {
    return this.prisma.periodo.findUnique({ where: { competencia }, select: CAMPOS_PERIODO });
  }

  /** Periodo que cobre a data. So existe um: os meses nao se sobrepoem (RN-01). */
  periodoNaData(data: Date): Promise<PeriodoRegistro | null> {
    return this.prisma.periodo.findFirst({
      where: { dataInicio: { lte: data }, dataFim: { gte: data } },
      select: CAMPOS_PERIODO,
    });
  }

  periodosNoIntervalo(inicio: Date, fim: Date): Promise<PeriodoRegistro[]> {
    return this.prisma.periodo.findMany({
      where: { dataInicio: { lte: fim }, dataFim: { gte: inicio } },
      select: CAMPOS_PERIODO,
      orderBy: [{ dataInicio: 'asc' }],
    });
  }

  criarPeriodo(dados: {
    competencia: string;
    dataInicio: Date;
    dataFim: Date;
  }): Promise<PeriodoRegistro> {
    return this.prisma.periodo.create({ data: dados, select: CAMPOS_PERIODO });
  }

  /**
   * Cria os dias de ponto que ainda nao existem.
   *
   * `skipDuplicates` sobre o unico [funcionario, data] e o que torna a geracao
   * idempotente: rodar de novo depois de admitir alguem no meio do mes cria
   * somente o que falta e nao toca no que ja foi lancado.
   */
  async criarDias(
    itens: readonly { periodoId: string; funcionarioId: string; data: Date }[],
  ): Promise<number> {
    if (itens.length === 0) {
      return 0;
    }
    const resultado = await this.prisma.$transaction((tx) =>
      tx.diaPonto.createMany({ data: [...itens], skipDuplicates: true }),
    );
    return resultado.count;
  }

  // -------------------------------------------------------------------------
  // RF-013 e RF-014 - consultas de lancamento
  // -------------------------------------------------------------------------

  /** Equipe de uma obra num dia: quem tem vinculo vigente naquela data. */
  async equipeDaObra(obraId: string, data: Date): Promise<VinculoVigenteRegistro[]> {
    const itens = await this.prisma.vinculoFuncionario.findMany({
      where: { obraId, ...this.vigenteNoIntervalo(data, data) },
      select: CAMPOS_VINCULO,
      orderBy: [{ funcionario: { nome: 'asc' } }],
    });
    return (itens as VinculoBruto[]).map(paraVinculo);
  }

  /** Vinculos que cobrem algum dia do intervalo. */
  async vinculosNoIntervalo(
    inicio: Date,
    fim: Date,
    filtro: { obrasPermitidas?: readonly string[]; funcionarioId?: string } = {},
  ): Promise<VinculoVigenteRegistro[]> {
    const itens = await this.prisma.vinculoFuncionario.findMany({
      where: {
        ...this.vigenteNoIntervalo(inicio, fim),
        ...(filtro.obrasPermitidas ? { obraId: { in: [...filtro.obrasPermitidas] } } : {}),
        ...(filtro.funcionarioId ? { funcionarioId: filtro.funcionarioId } : {}),
      },
      select: CAMPOS_VINCULO,
      orderBy: [{ inicioVigencia: 'asc' }],
    });
    return (itens as VinculoBruto[]).map(paraVinculo);
  }

  /** Dias de ponto dos funcionarios no intervalo, com as marcacoes. */
  async dias(
    funcionariosIds: readonly string[],
    inicio: Date,
    fim: Date,
  ): Promise<DiaPontoRegistro[]> {
    if (funcionariosIds.length === 0) {
      return [];
    }
    const itens = await this.prisma.diaPonto.findMany({
      where: { funcionarioId: { in: [...funcionariosIds] }, data: { gte: inicio, lte: fim } },
      select: CAMPOS_DIA,
      orderBy: [{ data: 'asc' }],
    });
    return itens;
  }

  feriados(inicio: Date, fim: Date): Promise<FeriadoDoDia[]> {
    return this.prisma.feriado.findMany({
      where: { data: { gte: inicio, lte: fim } },
      select: { data: true, descricao: true },
      orderBy: [{ data: 'asc' }],
    });
  }

  // -------------------------------------------------------------------------
  // RF-013 a RF-016 - gravacao
  // -------------------------------------------------------------------------

  /**
   * Grava os dias aceitos numa unica transacao (RF-013).
   *
   * Clique duplo na grade nao duplica nada: o dia e resolvido por upsert em
   * [funcionario, data] e cada marcacao por upsert em [dia, tipo].
   */
  async salvar(lancamentos: readonly LancamentoGravavel[]): Promise<DiaPontoRegistro[]> {
    if (lancamentos.length === 0) {
      return [];
    }

    return this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];

      for (const lancamento of lancamentos) {
        const dia = await tx.diaPonto.upsert({
          where: {
            funcionarioId_data: {
              funcionarioId: lancamento.funcionarioId,
              data: lancamento.data,
            },
          },
          create: {
            periodoId: lancamento.periodoId,
            funcionarioId: lancamento.funcionarioId,
            data: lancamento.data,
            ocorrencia: lancamento.ocorrencia,
            observacao: lancamento.observacao,
          },
          update: { ocorrencia: lancamento.ocorrencia, observacao: lancamento.observacao },
          select: { id: true },
        });

        ids.push(dia.id);

        for (const marcacao of lancamento.marcacoes) {
          await tx.marcacao.upsert({
            where: { diaPontoId_tipo: { diaPontoId: dia.id, tipo: marcacao.tipo } },
            create: { diaPontoId: dia.id, tipo: marcacao.tipo, horario: marcacao.horario },
            update: { horario: marcacao.horario },
            select: { id: true },
          });
        }

        if (lancamento.remover.length > 0) {
          await tx.marcacao.deleteMany({
            where: { diaPontoId: dia.id, tipo: { in: lancamento.remover } },
          });
        }
      }

      const salvos = await tx.diaPonto.findMany({
        where: { id: { in: ids } },
        select: CAMPOS_DIA,
        orderBy: [{ data: 'asc' }],
      });
      return salvos;
    });
  }
}
