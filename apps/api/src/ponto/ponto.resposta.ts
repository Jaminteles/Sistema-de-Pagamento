import {
  type DiaPontoResponse,
  type JornadaResumoResponse,
  type MarcacaoResponse,
  minutosParaHora,
  type PeriodoResponse,
  PerfilUsuario,
  StatusEnvioDia,
  StatusPeriodo,
  type TotaisPontoResponse,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import { dateParaDataIso, diasEntre } from '../common/data/data-iso';
import { instanteParaHoraLocal } from '../common/data/fuso-negocio';
import type {
  DiaPontoRegistro,
  JornadaResumo,
  MarcacaoRegistro,
  PeriodoRegistro,
} from './ponto.repository';

/**
 * Conversao dos registros de ponto na resposta da API e as regras de quem pode
 * escrever em cada dia.
 *
 * Esse "quem pode escrever" aparece na resposta so para a tela desabilitar
 * campo (RNF-01): a recusa de verdade acontece no service, antes de gravar.
 */

/**
 * Perfis que lancam ponto, conforme a linha "Lancar ponto" da matriz da secao 3
 * do Levantamento de Requisitos. O FINANCEIRO nao lanca nem ajusta ponto.
 */
export const PERFIS_QUE_LANCAM: readonly PerfilUsuario[] = [
  PerfilUsuario.ADMIN,
  PerfilUsuario.RH,
  PerfilUsuario.ENCARREGADO,
];

export interface MotivoBloqueio {
  motivo: string;
}

/**
 * Decide se o usuario pode escrever naquele dia, ou devolve o motivo do
 * bloqueio.
 *
 * Tres regras, nesta ordem:
 *   - RN-07: periodo FECHADO nao aceita escrita de ninguem;
 *   - RN-06: depois de enviado ao RH, o encarregado nao altera mais o periodo
 *     da equipe - nem pelo dia (statusEnvio), nem pelo periodo em conferencia;
 *   - matriz da secao 3: so ADMIN, RH e ENCARREGADO lancam ponto.
 */
export function bloqueioDeEscrita(
  usuario: UsuarioRequisicao,
  periodo: PeriodoRegistro | null,
  dia: Pick<DiaPontoRegistro, 'statusEnvio'> | null,
): MotivoBloqueio | null {
  if (!PERFIS_QUE_LANCAM.includes(usuario.perfil)) {
    return { motivo: 'Perfil sem permissao para lancar ponto.' };
  }
  if (periodo === null) {
    return { motivo: 'Nao existe periodo de apuracao aberto para esta data.' };
  }
  if (periodo.status === StatusPeriodo.FECHADO) {
    return { motivo: `Periodo ${periodo.competencia} esta fechado e nao aceita alteracao.` };
  }

  if (usuario.perfil === PerfilUsuario.ENCARREGADO) {
    if (periodo.status === StatusPeriodo.EM_CONFERENCIA) {
      return {
        motivo: `Periodo ${periodo.competencia} ja foi enviado ao RH e nao aceita mais alteracao do encarregado.`,
      };
    }
    if (dia !== null && dia.statusEnvio !== StatusEnvioDia.NAO_ENVIADO) {
      return { motivo: 'Dia ja enviado ao RH; procure o RH para ajustar.' };
    }
  }

  return null;
}

export function podeEscrever(
  usuario: UsuarioRequisicao,
  periodo: PeriodoRegistro | null,
  dia: Pick<DiaPontoRegistro, 'statusEnvio'> | null,
): boolean {
  return bloqueioDeEscrita(usuario, periodo, dia) === null;
}

export function paraPeriodoResponse(registro: PeriodoRegistro): PeriodoResponse {
  return {
    id: registro.id,
    competencia: registro.competencia,
    dataInicio: dateParaDataIso(registro.dataInicio),
    dataFim: dateParaDataIso(registro.dataFim),
    status: registro.status,
    fechadoEm: registro.fechadoEm ? registro.fechadoEm.toISOString() : null,
    reabertoEm: registro.reabertoEm ? registro.reabertoEm.toISOString() : null,
    criadoEm: registro.criadoEm.toISOString(),
    atualizadoEm: registro.atualizadoEm.toISOString(),
  };
}

export function paraJornadaResumo(jornada: JornadaResumo): JornadaResumoResponse {
  return {
    id: jornada.id,
    nome: jornada.nome,
    entradaMinutos: jornada.entradaMinutos,
    saidaMinutos: jornada.saidaMinutos,
    intervaloMinutos: jornada.intervaloMinutos,
    toleranciaMinutos: jornada.toleranciaMinutos,
    diasSemana: [...jornada.diasSemana],
  };
}

/**
 * Marcacao em "HH:MM" no fuso de negocio (RNF-12).
 *
 * `diaSeguinte` avisa a tela que aquele horario pertence ao dia civil seguinte,
 * o caso do turno da noite. Sem isso, "02:00" apareceria antes de "22:00".
 */
export function paraMarcacaoResponse(
  marcacao: MarcacaoRegistro,
  dataDoDia: Date,
): MarcacaoResponse {
  const local = instanteParaHoraLocal(marcacao.horario);
  return {
    id: marcacao.id,
    tipo: marcacao.tipo,
    hora: minutosParaHora(local.minutos),
    horario: marcacao.horario.toISOString(),
    origem: marcacao.origem,
    diaSeguinte: local.dataIso !== dateParaDataIso(dataDoDia),
  };
}

export function paraDiaResponse(registro: DiaPontoRegistro, editavel: boolean): DiaPontoResponse {
  return {
    id: registro.id,
    periodoId: registro.periodoId,
    funcionarioId: registro.funcionarioId,
    data: dateParaDataIso(registro.data),
    ocorrencia: registro.ocorrencia,
    statusEnvio: registro.statusEnvio,
    marcacoes: registro.marcacoes.map((item) => paraMarcacaoResponse(item, registro.data)),
    observacao: registro.observacao,
    minutosTrabalhados: registro.minutosTrabalhados,
    minutosExtras50: registro.minutosExtras50,
    minutosExtras100: registro.minutosExtras100,
    minutosNoturnos: registro.minutosNoturnos,
    minutosAtraso: registro.minutosAtraso,
    minutosFalta: registro.minutosFalta,
    apuradoEm: registro.apuradoEm ? registro.apuradoEm.toISOString() : null,
    editavel,
    atualizadoEm: registro.atualizadoEm.toISOString(),
  };
}

/** Soma dos totais ja calculados pelo motor de apuracao. Minutos inteiros. */
export function somarTotais(dias: readonly DiaPontoResponse[]): TotaisPontoResponse {
  return dias.reduce<TotaisPontoResponse>(
    (total, dia) => ({
      minutosTrabalhados: total.minutosTrabalhados + dia.minutosTrabalhados,
      minutosExtras50: total.minutosExtras50 + dia.minutosExtras50,
      minutosExtras100: total.minutosExtras100 + dia.minutosExtras100,
      minutosNoturnos: total.minutosNoturnos + dia.minutosNoturnos,
      minutosAtraso: total.minutosAtraso + dia.minutosAtraso,
      minutosFalta: total.minutosFalta + dia.minutosFalta,
    }),
    {
      minutosTrabalhados: 0,
      minutosExtras50: 0,
      minutosExtras100: 0,
      minutosNoturnos: 0,
      minutosAtraso: 0,
      minutosFalta: 0,
    },
  );
}

/** Quantidade de dias do intervalo, inclusive as duas pontas. */
export function quantidadeDeDias(inicio: Date, fim: Date): number {
  return diasEntre(inicio, fim) + 1;
}
