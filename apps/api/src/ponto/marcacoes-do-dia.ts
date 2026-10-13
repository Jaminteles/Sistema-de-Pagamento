import {
  horaParaMinutos,
  MINUTOS_NO_DIA,
  ORDEM_MARCACAO,
  type TipoMarcacao,
} from '@sistema/shared';
import { horaLocalParaInstante } from '../common/data/fuso-negocio';
import type { DiaPontoRegistro } from './ponto.repository';
import type { MarcacoesDigitadas } from './validacao-marcacoes';

/**
 * Conversao das marcacoes de um dia entre o que o usuario digita e o que esta
 * gravado.
 *
 * Usado pelo lancamento em lote (RF-013 e RF-014) e pelo ajuste com
 * justificativa (RF-017): as duas operacoes precisam combinar o digitado com o
 * gravado exatamente da mesma forma, e duplicar isso seria convidar as duas a
 * divergir no turno da noite.
 */

/** Horarios digitados: "HH:MM" grava, `null` apaga, ausente mantem o gravado. */
export type HorariosDigitados = Partial<Record<TipoMarcacao, string | null>>;

/** Minutos de parede da marcacao gravada, de 0 a 1439, como o usuario a ve. */
export function minutosDaMarcacao(horario: Date, dataIso: string): number {
  const meiaNoite = horaLocalParaInstante(dataIso, 0).getTime();
  const diferenca = Math.round((horario.getTime() - meiaNoite) / 60_000);
  return ((diferenca % MINUTOS_NO_DIA) + MINUTOS_NO_DIA) % MINUTOS_NO_DIA;
}

/**
 * Combina o que foi digitado com o que esta gravado.
 *
 * Devolve `null` quando algum horario veio fora de "HH:MM" - o DTO ja barra
 * isso, e esta checagem existe para o service nao confiar no formato.
 */
export function mesclarMarcacoes(
  horarios: HorariosDigitados,
  diaAtual: DiaPontoRegistro | null,
  dataIso: string,
): MarcacoesDigitadas | null {
  const valores: MarcacoesDigitadas = {};

  for (const tipo of ORDEM_MARCACAO) {
    const informado = horarios[tipo];

    if (informado === null) {
      continue;
    }

    if (typeof informado === 'string') {
      const minutos = horaParaMinutos(informado);
      if (minutos === null) {
        return null;
      }
      valores[tipo] = minutos;
      continue;
    }

    const gravada = diaAtual?.marcacoes.find((item) => item.tipo === tipo);
    if (gravada) {
      valores[tipo] = minutosDaMarcacao(gravada.horario, dataIso);
    }
  }

  return valores;
}
