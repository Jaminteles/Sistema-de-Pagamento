import { Injectable } from '@nestjs/common';
import type { ApurarPeriodoResponse, TotaisPontoResponse } from '@sistema/shared';
import { dateParaDataIso, diaSemanaIso } from '../common/data/data-iso';
import { horaLocalParaInstante } from '../common/data/fuso-negocio';
import { paraPeriodoResponse, somarTotais } from '../ponto/ponto.resposta';
import {
  type DiaPontoRegistro,
  type PeriodoRegistro,
  PontoRepository,
  type TotaisGravaveis,
  type VinculoVigenteRegistro,
} from '../ponto/ponto.repository';
import { apurarDia, type DiaApuracao, type MarcacaoApuracao } from './motor-apuracao';

/**
 * Apuracao dos dias de ponto (T-043 / RF-020).
 *
 * Camada fina em volta do motor: busca o que a regra precisa (jornada vigente
 * no dia e feriado) e grava os minutos calculados. A conta em si mora no motor,
 * que e funcao pura e testada caso a caso (T-044).
 *
 * Roda logo depois de cada gravacao de ponto - lancamento, ajuste e importacao
 * - para o dia nunca ficar com total velho ao lado de marcacao nova. O
 * recalculo do periodo inteiro existe para quando muda algo de fora do dia:
 * feriado cadastrado depois, jornada corrigida, vinculo acertado.
 */
@Injectable()
export class ApuracaoService {
  constructor(private readonly repositorio: PontoRepository) {}

  /**
   * Apura os dias informados e devolve os mesmos registros com os totais
   * atualizados, sem reconsultar o banco.
   */
  async apurar(dias: readonly DiaPontoRegistro[]): Promise<DiaPontoRegistro[]> {
    if (dias.length === 0) {
      return [];
    }

    const tempos = dias.map((dia) => dia.data.getTime());
    const inicio = new Date(Math.min(...tempos));
    const fim = new Date(Math.max(...tempos));
    const funcionariosIds = [...new Set(dias.map((dia) => dia.funcionarioId))];

    const [vinculos, feriados] = await Promise.all([
      this.repositorio.vinculosNoIntervalo(inicio, fim, { funcionariosIds }),
      this.repositorio.feriados(inicio, fim),
    ]);

    const diasFeriado = new Set(feriados.map((feriado) => dateParaDataIso(feriado.data)));

    const itens: TotaisGravaveis[] = dias.map((dia) => ({
      diaPontoId: dia.id,
      totais: apurarDia(this.montar(dia, vinculos, diasFeriado)),
    }));

    const apuradoEm = new Date();
    await this.repositorio.salvarTotais(itens, apuradoEm);

    return dias.map((dia, indice) => ({
      ...dia,
      ...(itens[indice] as TotaisGravaveis).totais,
      apuradoEm,
    }));
  }

  /**
   * Recalcula o periodo inteiro (RF-020).
   *
   * Nao mexe em marcacao nem em ocorrencia: so refaz os minutos. Periodo
   * fechado tambem pode ser recalculado pelo RH, porque isso nao altera o ponto
   * lancado - o bloqueio da RN-07 vale para escrita de ponto.
   */
  async apurarPeriodo(periodo: PeriodoRegistro): Promise<ApurarPeriodoResponse> {
    const dias = await this.repositorio.diasDoPeriodo(periodo.id);
    const apurados = await this.apurar(dias);

    return {
      periodo: paraPeriodoResponse(periodo),
      dias: apurados.length,
      funcionarios: new Set(apurados.map((dia) => dia.funcionarioId)).size,
      totais: this.totaisDe(apurados),
    };
  }

  private totaisDe(dias: readonly DiaPontoRegistro[]): TotaisPontoResponse {
    return somarTotais(
      dias.map((dia) => ({
        minutosTrabalhados: dia.minutosTrabalhados,
        minutosExtras50: dia.minutosExtras50,
        minutosExtras100: dia.minutosExtras100,
        minutosNoturnos: dia.minutosNoturnos,
        minutosAtraso: dia.minutosAtraso,
        minutosFalta: dia.minutosFalta,
      })),
    );
  }

  /** Monta a entrada do motor a partir do registro do dia. */
  private montar(
    dia: DiaPontoRegistro,
    vinculos: readonly VinculoVigenteRegistro[],
    diasFeriado: ReadonlySet<string>,
  ): DiaApuracao {
    const dataIso = dateParaDataIso(dia.data);
    const vinculo = vinculos.find(
      (item) =>
        item.funcionarioId === dia.funcionarioId &&
        item.inicioVigencia <= dia.data &&
        (item.fimVigencia === null || item.fimVigencia >= dia.data),
    );

    return {
      diaSemana: diaSemanaIso(dia.data),
      feriado: diasFeriado.has(dataIso),
      ocorrencia: dia.ocorrencia,
      jornada: vinculo
        ? {
            entradaMinutos: vinculo.jornada.entradaMinutos,
            saidaMinutos: vinculo.jornada.saidaMinutos,
            intervaloMinutos: vinculo.jornada.intervaloMinutos,
            toleranciaMinutos: vinculo.jornada.toleranciaMinutos,
            diasSemana: vinculo.jornada.diasSemana,
          }
        : null,
      marcacoes: this.marcacoesEmMinutos(dia, dataIso),
    };
  }

  /**
   * Marcacoes em minutos contados desde a meia-noite do dia do ponto, no fuso
   * de negocio (RNF-12).
   *
   * O turno da noite passa de 1440 de proposito: e assim que a saida as 02:00
   * continua depois da entrada as 22:00 em vez de voltar no tempo.
   */
  private marcacoesEmMinutos(dia: DiaPontoRegistro, dataIso: string): MarcacaoApuracao[] {
    const meiaNoite = horaLocalParaInstante(dataIso, 0).getTime();

    return dia.marcacoes
      .map((marcacao) => ({
        tipo: marcacao.tipo,
        absoluto: Math.round((marcacao.horario.getTime() - meiaNoite) / 60_000),
      }))
      .sort((a, b) => a.absoluto - b.absoluto);
  }
}
