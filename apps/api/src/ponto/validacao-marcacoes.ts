import {
  type CampoLancamento,
  MINUTOS_NO_DIA,
  minutosParaDuracao,
  minutosParaHora,
  ORDEM_MARCACAO,
  PONTO_JANELA_MAXIMA_MINUTOS,
  type TipoMarcacao,
  TipoMarcacao as Tipos,
} from '@sistema/shared';

/**
 * Validacao das marcacoes de um dia (RF-016): ordem cronologica, sobreposicao e
 * intervalo minimo.
 *
 * Funcao pura, sem banco e sem Nest, porque e a regra mais exercitada do
 * modulo: recebe as marcacoes digitadas em minutos do dia e devolve, ou os
 * instantes resolvidos, ou a lista de erros por campo.
 *
 * O turno da noite e tratado aqui: marcacao menor que a anterior cai no dia
 * seguinte, desde que a janela entre a primeira e a ultima nao passe de
 * PONTO_JANELA_MAXIMA_MINUTOS. Acima disso o que existe e erro de digitacao
 * (saida antes da entrada), nao turno virando a meia-noite.
 */

/** Marcacao como o usuario digitou: minutos desde a meia-noite local. */
export type MarcacoesDigitadas = Partial<Record<TipoMarcacao, number>>;

/** Marcacao resolvida: minutos contados desde a meia-noite do dia do ponto. */
export interface MarcacaoResolvida {
  tipo: TipoMarcacao;
  /** 0 a 1439: a hora que o usuario ve. */
  minutos: number;
  /** Deslocamento em dias (0 no mesmo dia, 1 depois da meia-noite). */
  dias: number;
  /** minutos + dias * 1440. Usado nas comparacoes. */
  absoluto: number;
}

/** Intervalo ocupado por outro dia de ponto, em minutos relativos a este dia. */
export interface OcupacaoVizinha {
  /** "AAAA-MM-DD" do dia vizinho, usado na mensagem. */
  data: string;
  inicio: number;
  fim: number;
}

export interface ContextoValidacao {
  /** Intervalo minimo da jornada do vinculo vigente (RF-009). */
  intervaloMinimoMinutos: number;
  /** Dias vizinhos ja gravados, para recusar sobreposicao (RF-016). */
  vizinhas?: readonly OcupacaoVizinha[];
}

export interface ErroMarcacao {
  campo: CampoLancamento;
  motivo: string;
}

export type ResultadoValidacao =
  { valido: true; marcacoes: MarcacaoResolvida[] } | { valido: false; erros: ErroMarcacao[] };

/** Marcacoes presentes, na ordem cronologica esperada. */
function presentes(digitadas: MarcacoesDigitadas): { tipo: TipoMarcacao; minutos: number }[] {
  return ORDEM_MARCACAO.filter((tipo) => digitadas[tipo] !== undefined).map((tipo) => ({
    tipo,
    minutos: digitadas[tipo] as number,
  }));
}

/**
 * Pares obrigatorios: sem entrada nada mais faz sentido, e intervalo aberto
 * sem retorno deixaria a apuracao sem saber quanto descontar.
 */
function validarCompletude(digitadas: MarcacoesDigitadas): ErroMarcacao[] {
  const erros: ErroMarcacao[] = [];
  const tem = (tipo: TipoMarcacao): boolean => digitadas[tipo] !== undefined;

  if (!tem(Tipos.ENTRADA) && presentes(digitadas).length > 0) {
    erros.push({ campo: Tipos.ENTRADA, motivo: 'Informe a entrada antes das outras marcacoes.' });
  }
  if (tem(Tipos.SAIDA_INTERVALO) !== tem(Tipos.RETORNO_INTERVALO)) {
    erros.push({
      campo: Tipos.RETORNO_INTERVALO,
      motivo: 'Informe a saida e o retorno do intervalo juntos.',
    });
  }
  return erros;
}

/**
 * Resolve o deslocamento de dia de cada marcacao e cobra a ordem cronologica.
 *
 * Horario igual ao anterior e erro proprio: duas batidas no mesmo minuto nao
 * sao turno da noite, sao digitacao repetida.
 */
function resolver(marcacoes: readonly { tipo: TipoMarcacao; minutos: number }[]): {
  resolvidas: MarcacaoResolvida[];
  erros: ErroMarcacao[];
} {
  const resolvidas: MarcacaoResolvida[] = [];
  const erros: ErroMarcacao[] = [];
  let anterior: MarcacaoResolvida | null = null;

  for (const marcacao of marcacoes) {
    if (anterior === null) {
      anterior = { ...marcacao, dias: 0, absoluto: marcacao.minutos };
      resolvidas.push(anterior);
      continue;
    }

    if (marcacao.minutos === anterior.minutos) {
      erros.push({
        campo: marcacao.tipo,
        motivo: `Horario igual ao da marcacao anterior (${minutosParaHora(marcacao.minutos)}).`,
      });
      return { resolvidas, erros };
    }

    const dias = marcacao.minutos > anterior.minutos ? anterior.dias : anterior.dias + 1;
    const atual: MarcacaoResolvida = {
      ...marcacao,
      dias,
      absoluto: marcacao.minutos + dias * MINUTOS_NO_DIA,
    };

    if (atual.absoluto <= anterior.absoluto) {
      erros.push({
        campo: marcacao.tipo,
        motivo: 'As marcacoes precisam estar em ordem crescente.',
      });
      return { resolvidas, erros };
    }

    const primeiro = resolvidas[0] as MarcacaoResolvida;
    if (atual.absoluto - primeiro.absoluto > PONTO_JANELA_MAXIMA_MINUTOS) {
      erros.push({
        campo: marcacao.tipo,
        motivo:
          `Horario fora de ordem: ${minutosParaHora(marcacao.minutos)} daria mais de ` +
          `${minutosParaDuracao(PONTO_JANELA_MAXIMA_MINUTOS)} desde a entrada.`,
      });
      return { resolvidas, erros };
    }

    resolvidas.push(atual);
    anterior = atual;
  }

  return { resolvidas, erros };
}

/** RF-016: o intervalo nao pode ser menor que o da jornada do vinculo. */
function validarIntervalo(
  resolvidas: readonly MarcacaoResolvida[],
  minimo: number,
): ErroMarcacao[] {
  const saida = resolvidas.find((item) => item.tipo === Tipos.SAIDA_INTERVALO);
  const retorno = resolvidas.find((item) => item.tipo === Tipos.RETORNO_INTERVALO);
  if (!saida || !retorno || minimo <= 0) {
    return [];
  }

  const duracao = retorno.absoluto - saida.absoluto;
  if (duracao < minimo) {
    return [
      {
        campo: Tipos.RETORNO_INTERVALO,
        motivo:
          `O intervalo ficou com ${minutosParaDuracao(duracao)} e a jornada exige no minimo ` +
          `${minutosParaDuracao(minimo)}.`,
      },
    ];
  }
  return [];
}

/**
 * RF-016: a jornada do dia nao pode invadir a de outro dia.
 *
 * Importa no turno da noite, em que a saida cai depois da meia-noite: sem isso,
 * o mesmo intervalo de tempo entraria em dois dias de ponto e seria pago duas
 * vezes.
 */
export function validarSobreposicao(
  resolvidas: readonly MarcacaoResolvida[],
  vizinhas: readonly OcupacaoVizinha[],
): ErroMarcacao[] {
  if (resolvidas.length === 0 || vizinhas.length === 0) {
    return [];
  }

  const inicio = (resolvidas[0] as MarcacaoResolvida).absoluto;
  const fim = (resolvidas[resolvidas.length - 1] as MarcacaoResolvida).absoluto;

  const conflito = vizinhas.find((vizinha) => inicio <= vizinha.fim && vizinha.inicio <= fim);
  if (!conflito) {
    return [];
  }

  return [
    {
      campo: Tipos.ENTRADA,
      motivo: `O horario se sobrepoe ao ponto do dia ${conflito.data}.`,
    },
  ];
}

export function validarMarcacoes(
  digitadas: MarcacoesDigitadas,
  contexto: ContextoValidacao,
): ResultadoValidacao {
  const faltando = validarCompletude(digitadas);
  if (faltando.length > 0) {
    return { valido: false, erros: faltando };
  }

  const lista = presentes(digitadas);
  if (lista.length === 0) {
    return { valido: true, marcacoes: [] };
  }

  const { resolvidas, erros } = resolver(lista);
  if (erros.length > 0) {
    return { valido: false, erros };
  }

  const demais = [
    ...validarIntervalo(resolvidas, contexto.intervaloMinimoMinutos),
    ...validarSobreposicao(resolvidas, contexto.vizinhas ?? []),
  ];

  return demais.length > 0
    ? { valido: false, erros: demais }
    : { valido: true, marcacoes: resolvidas };
}
