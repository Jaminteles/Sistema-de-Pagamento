import { TIMEZONE_NEGOCIO } from '@sistema/shared';
import { dataIsoParaDate } from './data-iso';

/**
 * Conversao entre instante (timestamptz) e hora de parede no fuso de negocio
 * America/Bahia (RNF-12).
 *
 * Marcacao de ponto e timestamptz, mas o encarregado digita "07:00" pensando no
 * relogio da obra. Converter pelo fuso do servidor erraria o horario gravado
 * sempre que o container subisse em UTC - que e exatamente o caso do Docker
 * Compose do projeto.
 *
 * O deslocamento vem do Intl, nao de uma constante: se a regra de fuso mudar, a
 * conversao acompanha o sistema operacional em vez de ficar errada em silencio.
 */

const FORMATADOR = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

interface HoraLocal {
  /** "AAAA-MM-DD" no fuso de negocio. */
  dataIso: string;
  /** Minutos desde a meia-noite local, de 0 a 1439. */
  minutos: number;
}

function partes(instante: Date): {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
} {
  const lidas: Record<string, string> = {};
  for (const parte of FORMATADOR.formatToParts(instante)) {
    if (parte.type !== 'literal') {
      lidas[parte.type] = parte.value;
    }
  }
  return {
    ano: Number(lidas['year']),
    mes: Number(lidas['month']),
    dia: Number(lidas['day']),
    // 24 aparece na virada em alguns runtimes; vale como 0 do dia seguinte,
    // que o Date.UTC normaliza.
    hora: Number(lidas['hour']) % 24,
    minuto: Number(lidas['minute']),
    segundo: Number(lidas['second']),
  };
}

/** Deslocamento do fuso naquele instante, em milissegundos (negativo a oeste). */
function deslocamento(instante: Date): number {
  const local = partes(instante);
  const comoUtc = Date.UTC(
    local.ano,
    local.mes - 1,
    local.dia,
    local.hora,
    local.minuto,
    local.segundo,
  );
  return comoUtc - instante.getTime();
}

/** Instante absoluto para a hora de parede no fuso de negocio. */
export function instanteParaHoraLocal(instante: Date): HoraLocal {
  const local = partes(instante);
  const mes = String(local.mes).padStart(2, '0');
  const dia = String(local.dia).padStart(2, '0');
  return {
    dataIso: `${local.ano}-${mes}-${dia}`,
    minutos: local.hora * 60 + local.minuto,
  };
}

/**
 * Hora de parede no fuso de negocio para instante absoluto.
 *
 * `minutos` pode passar de 1440: a marcacao do turno da noite que cai depois da
 * meia-noite e informada como "dia + 1". Duas iteracoes bastam para o
 * deslocamento convergir, inclusive em fuso com horario de verao.
 */
export function horaLocalParaInstante(dataIso: string, minutos: number): Date {
  const base = dataIsoParaDate(dataIso).getTime() + minutos * 60_000;
  let instante = new Date(base);
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    instante = new Date(base - deslocamento(instante));
  }
  return instante;
}

/**
 * Dia de hoje no fuso de negocio, como `Date` em UTC para comparar com colunas
 * `date`.
 */
export function hojeNoFusoDeNegocio(agora: Date = new Date()): Date {
  return dataIsoParaDate(instanteParaHoraLocal(agora).dataIso);
}
