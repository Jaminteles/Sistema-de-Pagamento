import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type GerarDiasResponse,
  PAGINACAO_TAMANHO_PADRAO,
  type PeriodoResponse,
  type RespostaPaginada,
} from '@sistema/shared';
import { datasDoIntervalo, intervaloDaCompetencia } from '../common/data/data-iso';
import type { AbrirPeriodoDto } from './dto/abrir-periodo.dto';
import type { ListarPeriodosQuery } from './dto/listar-periodos.query';
import { paraPeriodoResponse } from './ponto.resposta';
import { type PeriodoRegistro, PontoRepository } from './ponto.repository';

/** Dia a gerar, com chave para nao repetir funcionario que trocou de obra no mes. */
interface DiaAGerar {
  periodoId: string;
  funcionarioId: string;
  data: Date;
}

function maiorData(datas: readonly Date[]): Date {
  return datas.reduce((maior, atual) => (atual > maior ? atual : maior));
}

function menorData(datas: readonly Date[]): Date {
  return datas.reduce((menor, atual) => (atual < menor ? atual : menor));
}

/**
 * Abertura do periodo e geracao dos dias de ponto (T-031 / RF-013).
 *
 * O periodo e mensal, do dia 1 ao ultimo dia do mes (RN-01); o dia de corte
 * configuravel e da sprint 11 (RF-039). Abrir o periodo gera um dia_ponto para
 * cada funcionario com vinculo vigente em cada data do mes, porque a grade de
 * lancamento e o painel de pendencias precisam saber quais dias deveriam
 * existir - inclusive os que ninguem lancou.
 *
 * Pela matriz da secao 3, periodo e assunto de ADMIN e RH.
 */
@Injectable()
export class PeriodosService {
  constructor(private readonly repositorio: PontoRepository) {}

  async listar(query: ListarPeriodosQuery): Promise<RespostaPaginada<PeriodoResponse>> {
    const pagina = query.pagina ?? 1;
    const tamanho = query.tamanho ?? PAGINACAO_TAMANHO_PADRAO;

    const { itens, total } = await this.repositorio.listarPeriodos({
      ...(query.status ? { status: query.status } : {}),
      pular: (pagina - 1) * tamanho,
      limite: tamanho,
    });

    return { itens: itens.map(paraPeriodoResponse), total, pagina, tamanho };
  }

  async buscar(id: string): Promise<PeriodoResponse> {
    return paraPeriodoResponse(await this.exigirPeriodo(id));
  }

  /**
   * Abre a competencia e gera os dias (RF-013).
   *
   * Competencia repetida responde 409 em vez de criar outro periodo: dois
   * periodos cobrindo o mesmo mes deixariam o dia de ponto sem dono.
   */
  async abrir(dto: AbrirPeriodoDto): Promise<GerarDiasResponse> {
    const existente = await this.repositorio.buscarPeriodoPorCompetencia(dto.competencia);
    if (existente) {
      throw new ConflictException(`Ja existe periodo para a competencia ${dto.competencia}.`);
    }

    const { inicio, fim } = intervaloDaCompetencia(dto.competencia);
    const periodo = await this.repositorio.criarPeriodo({
      competencia: dto.competencia,
      dataInicio: inicio,
      dataFim: fim,
    });

    return this.gerar(periodo);
  }

  /**
   * Gera os dias que faltam de um periodo ja aberto.
   *
   * Usado depois de admitir ou vincular alguem no meio do mes. E idempotente: o
   * unico [funcionario, data] descarta o que ja existe, sem tocar no que foi
   * lancado.
   */
  async gerarDias(periodoId: string): Promise<GerarDiasResponse> {
    return this.gerar(await this.exigirPeriodo(periodoId));
  }

  private async exigirPeriodo(id: string): Promise<PeriodoRegistro> {
    const periodo = await this.repositorio.buscarPeriodo(id);
    if (!periodo) {
      throw new NotFoundException('Periodo nao encontrado.');
    }
    return periodo;
  }

  private async gerar(periodo: PeriodoRegistro): Promise<GerarDiasResponse> {
    const vinculos = await this.repositorio.vinculosNoIntervalo(
      periodo.dataInicio,
      periodo.dataFim,
    );

    const vistos = new Set<string>();
    const dias: DiaAGerar[] = [];

    for (const vinculo of vinculos) {
      // A janela do funcionario e a intersecao do periodo com a vigencia do
      // vinculo, a admissao e o desligamento: RN-12 proibe lancamento novo para
      // quem foi desligado, e o dia anterior a admissao nunca existiu.
      const inicio = maiorData([periodo.dataInicio, vinculo.inicioVigencia, vinculo.admissao]);
      const fim = menorData([
        periodo.dataFim,
        vinculo.fimVigencia ?? periodo.dataFim,
        vinculo.desligamento ?? periodo.dataFim,
      ]);

      if (inicio > fim) {
        continue;
      }

      for (const data of datasDoIntervalo(inicio, fim)) {
        const chave = `${vinculo.funcionarioId}:${data.getTime()}`;
        if (vistos.has(chave)) {
          continue;
        }
        vistos.add(chave);
        dias.push({ periodoId: periodo.id, funcionarioId: vinculo.funcionarioId, data });
      }
    }

    const funcionarios = new Set(dias.map((dia) => dia.funcionarioId)).size;
    const diasCriados = await this.repositorio.criarDias(dias);

    return { periodo: paraPeriodoResponse(periodo), funcionarios, diasCriados };
  }
}
