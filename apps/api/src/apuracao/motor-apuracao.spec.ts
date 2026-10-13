import { OcorrenciaDia, TipoMarcacao } from '@sistema/shared';
import {
  apurarDia,
  type DiaApuracao,
  type JornadaApuracao,
  type MarcacaoApuracao,
  minutosNoturnosDoTrecho,
  minutosPrevistos,
} from './motor-apuracao';

/**
 * Motor de apuracao diaria (T-044 / RF-020 e RNF-10).
 *
 * Os casos sao de obra, nao de laboratorio: dia cheio, oito minutos a mais,
 * meia hora a mais, atraso, domingo, feriado, sabado fora da escala, turno da
 * noite virando a meia-noite, falta e abono. Cada um amarra uma regra de
 * negocio (RN-02, RN-03 ou RN-04) a um numero.
 */

/** Jornada 07:00 as 17:00 com 1h de intervalo, de segunda a sexta. */
const COMERCIAL: JornadaApuracao = {
  entradaMinutos: 7 * 60,
  saidaMinutos: 17 * 60,
  intervaloMinutos: 60,
  toleranciaMinutos: 10,
  diasSemana: [1, 2, 3, 4, 5],
};

/** Turno da noite: 22:00 as 06:00 com 1h de intervalo. */
const NOTURNA: JornadaApuracao = {
  entradaMinutos: 22 * 60,
  saidaMinutos: 6 * 60,
  intervaloMinutos: 60,
  toleranciaMinutos: 10,
  diasSemana: [1, 2, 3, 4, 5],
};

/** "07:00" ou "26:30" (02:30 do dia seguinte) para minutos do dia do ponto. */
function minutos(hora: string): number {
  const [horas, mins] = hora.split(':').map(Number) as [number, number];
  return horas * 60 + mins;
}

function marcacoes(...horarios: readonly [TipoMarcacao, string][]): MarcacaoApuracao[] {
  return horarios.map(([tipo, hora]) => ({ tipo, absoluto: minutos(hora) }));
}

/** Dia completo: entrada, intervalo e saida. */
function diaCheio(
  entrada: string,
  saidaIntervalo: string,
  retorno: string,
  saida: string,
): MarcacaoApuracao[] {
  return marcacoes(
    [TipoMarcacao.ENTRADA, entrada],
    [TipoMarcacao.SAIDA_INTERVALO, saidaIntervalo],
    [TipoMarcacao.RETORNO_INTERVALO, retorno],
    [TipoMarcacao.SAIDA, saida],
  );
}

function dia(parcial: Partial<DiaApuracao> = {}): DiaApuracao {
  return {
    diaSemana: 2,
    feriado: false,
    ocorrencia: OcorrenciaDia.NORMAL,
    jornada: COMERCIAL,
    marcacoes: [],
    ...parcial,
  };
}

describe('minutosPrevistos', () => {
  it('desconta o intervalo da jornada do dia util', () => {
    expect(minutosPrevistos(dia())).toBe(540);
  });

  it('nao preve trabalho em feriado nem em dia fora da escala (RN-03)', () => {
    expect(minutosPrevistos(dia({ feriado: true }))).toBe(0);
    expect(minutosPrevistos(dia({ diaSemana: 6 }))).toBe(0);
    expect(minutosPrevistos(dia({ diaSemana: 7 }))).toBe(0);
  });

  it('nao preve trabalho sem vinculo vigente', () => {
    expect(minutosPrevistos(dia({ jornada: null }))).toBe(0);
  });

  it('atravessa a meia-noite no turno da noite', () => {
    expect(minutosPrevistos(dia({ jornada: NOTURNA }))).toBe(420);
  });
});

describe('minutosNoturnosDoTrecho (RN-04)', () => {
  it('conta so o que cai entre 22h e 5h', () => {
    expect(minutosNoturnosDoTrecho({ inicio: minutos('18:00'), fim: minutos('23:00') })).toBe(60);
  });

  it('conta a madrugada do proprio dia', () => {
    expect(minutosNoturnosDoTrecho({ inicio: 0, fim: minutos('06:00') })).toBe(300);
  });

  it('conta a faixa inteira no trecho que vira a meia-noite', () => {
    // 22:00 as 05:00 do dia seguinte: a faixa noturna completa.
    expect(minutosNoturnosDoTrecho({ inicio: minutos('22:00'), fim: 29 * 60 })).toBe(420);
  });

  it('ignora o trecho fora da faixa', () => {
    expect(minutosNoturnosDoTrecho({ inicio: minutos('08:00'), fim: minutos('17:00') })).toBe(0);
  });
});

describe('apurarDia - dia util normal', () => {
  it('fecha a jornada exata sem extra e sem atraso', () => {
    const totais = apurarDia(dia({ marcacoes: diaCheio('07:00', '11:00', '12:00', '17:00') }));

    expect(totais).toEqual({
      minutosTrabalhados: 540,
      minutosExtras50: 0,
      minutosExtras100: 0,
      minutosNoturnos: 0,
      minutosAtraso: 0,
      minutosFalta: 0,
    });
  });

  it('nao gera extra dentro da tolerancia de 10 minutos (RN-02)', () => {
    const totais = apurarDia(dia({ marcacoes: diaCheio('07:00', '11:00', '12:00', '17:08') }));

    expect(totais.minutosTrabalhados).toBe(548);
    expect(totais.minutosExtras50).toBe(0);
    expect(totais.minutosAtraso).toBe(0);
  });

  it('nao gera atraso dentro da tolerancia de 10 minutos (RN-02)', () => {
    const totais = apurarDia(dia({ marcacoes: diaCheio('07:07', '11:00', '12:00', '17:00') }));

    expect(totais.minutosTrabalhados).toBe(533);
    expect(totais.minutosAtraso).toBe(0);
    expect(totais.minutosExtras50).toBe(0);
  });

  it('conta o excedente inteiro quando passa da tolerancia (RN-02 e RN-03)', () => {
    const totais = apurarDia(dia({ marcacoes: diaCheio('07:00', '11:00', '12:00', '17:30') }));

    // Passando dos 10 minutos, conta a diferenca toda - nao o que sobra dela.
    expect(totais.minutosExtras50).toBe(30);
    expect(totais.minutosExtras100).toBe(0);
  });

  it('conta atraso quando trabalha menos que o previsto', () => {
    const totais = apurarDia(dia({ marcacoes: diaCheio('07:30', '11:00', '12:00', '17:00') }));

    expect(totais.minutosTrabalhados).toBe(510);
    expect(totais.minutosAtraso).toBe(30);
    expect(totais.minutosFalta).toBe(0);
  });

  it('trabalha sem intervalo quando so ha entrada e saida', () => {
    const totais = apurarDia(
      dia({ marcacoes: marcacoes([TipoMarcacao.ENTRADA, '08:00'], [TipoMarcacao.SAIDA, '12:00']) }),
    );

    expect(totais.minutosTrabalhados).toBe(240);
    expect(totais.minutosAtraso).toBe(300);
  });
});

describe('apurarDia - extras 50% e 100% (RN-03)', () => {
  it('paga 100% o trabalho em domingo', () => {
    const totais = apurarDia(
      dia({
        diaSemana: 7,
        marcacoes: marcacoes([TipoMarcacao.ENTRADA, '08:00'], [TipoMarcacao.SAIDA, '12:00']),
      }),
    );

    expect(totais.minutosExtras100).toBe(240);
    expect(totais.minutosExtras50).toBe(0);
    expect(totais.minutosAtraso).toBe(0);
  });

  it('paga 100% o trabalho em feriado de dia util', () => {
    const totais = apurarDia(
      dia({
        feriado: true,
        marcacoes: diaCheio('07:00', '11:00', '12:00', '17:00'),
      }),
    );

    expect(totais.minutosExtras100).toBe(540);
    expect(totais.minutosExtras50).toBe(0);
  });

  it('paga 50% o trabalho em sabado fora da escala', () => {
    const totais = apurarDia(
      dia({
        diaSemana: 6,
        marcacoes: marcacoes([TipoMarcacao.ENTRADA, '08:00'], [TipoMarcacao.SAIDA, '12:00']),
      }),
    );

    expect(totais.minutosExtras50).toBe(240);
    expect(totais.minutosExtras100).toBe(0);
  });

  it('trata como extra integral o dia sem vinculo vigente', () => {
    const totais = apurarDia(
      dia({
        jornada: null,
        marcacoes: marcacoes([TipoMarcacao.ENTRADA, '08:00'], [TipoMarcacao.SAIDA, '10:00']),
      }),
    );

    // Sem jornada nao ha tolerancia nem previsto: o que foi lancado e excedente.
    expect(totais.minutosTrabalhados).toBe(120);
    expect(totais.minutosExtras50).toBe(120);
  });
});

describe('apurarDia - turno da noite (RN-04)', () => {
  it('apura o turno que vira a meia-noite', () => {
    const totais = apurarDia(
      dia({
        jornada: NOTURNA,
        marcacoes: diaCheio('22:00', '25:00', '26:00', '30:00'),
      }),
    );

    // 22:00->01:00 e 02:00->06:00: 180 + 240 minutos.
    expect(totais.minutosTrabalhados).toBe(420);
    // A faixa de 22h as 5h, menos a hora de intervalo que cai dentro dela.
    expect(totais.minutosNoturnos).toBe(360);
    expect(totais.minutosExtras50).toBe(0);
    expect(totais.minutosAtraso).toBe(0);
  });

  it('conta como noturno so a parte da faixa quando a saida passa das 5h', () => {
    const totais = apurarDia(
      dia({
        jornada: NOTURNA,
        marcacoes: marcacoes([TipoMarcacao.ENTRADA, '23:00'], [TipoMarcacao.SAIDA, '31:00']),
      }),
    );

    expect(totais.minutosTrabalhados).toBe(480);
    // 23:00 as 05:00 sao noturnas; 05:00 as 07:00 nao.
    expect(totais.minutosNoturnos).toBe(360);
    expect(totais.minutosExtras50).toBe(60);
  });
});

describe('apurarDia - ocorrencias (RF-015)', () => {
  it('desconta a jornada prevista na falta', () => {
    const totais = apurarDia(dia({ ocorrencia: OcorrenciaDia.FALTA }));

    expect(totais.minutosFalta).toBe(540);
    expect(totais.minutosTrabalhados).toBe(0);
    expect(totais.minutosAtraso).toBe(0);
  });

  it('nao desconta nada nos abonos', () => {
    for (const ocorrencia of [
      OcorrenciaDia.FALTA_JUSTIFICADA,
      OcorrenciaDia.ATESTADO,
      OcorrenciaDia.FOLGA,
      OcorrenciaDia.FERIAS,
      OcorrenciaDia.AFASTAMENTO,
    ]) {
      expect(apurarDia(dia({ ocorrencia })).minutosFalta).toBe(0);
    }
  });

  it('nao desconta falta em dia sem jornada prevista', () => {
    expect(apurarDia(dia({ ocorrencia: OcorrenciaDia.FALTA, diaSemana: 7 })).minutosFalta).toBe(0);
    expect(apurarDia(dia({ ocorrencia: OcorrenciaDia.FALTA, feriado: true })).minutosFalta).toBe(0);
  });
});

describe('apurarDia - dia sem lancamento fechado', () => {
  it('nao presume falta no dia normal sem marcacao', () => {
    const totais = apurarDia(dia());

    // Dia nao lancado e pendencia do periodo (RF-022), nao falta do funcionario.
    expect(totais.minutosFalta).toBe(0);
    expect(totais.minutosAtraso).toBe(0);
    expect(totais.minutosTrabalhados).toBe(0);
  });

  it('nao presume saida quando so ha entrada', () => {
    const totais = apurarDia(dia({ marcacoes: marcacoes([TipoMarcacao.ENTRADA, '07:00']) }));

    expect(totais.minutosTrabalhados).toBe(0);
    expect(totais.minutosAtraso).toBe(0);
  });

  it('apura o primeiro trecho quando o intervalo ficou aberto', () => {
    const totais = apurarDia(
      dia({
        marcacoes: marcacoes(
          [TipoMarcacao.ENTRADA, '07:00'],
          [TipoMarcacao.SAIDA_INTERVALO, '11:00'],
          [TipoMarcacao.RETORNO_INTERVALO, '12:00'],
        ),
      }),
    );

    expect(totais.minutosTrabalhados).toBe(240);
    expect(totais.minutosAtraso).toBe(300);
  });
});
