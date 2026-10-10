import { PONTO_JANELA_MAXIMA_MINUTOS, TipoMarcacao } from '@sistema/shared';
import {
  type MarcacoesDigitadas,
  validarMarcacoes,
  validarSobreposicao,
} from './validacao-marcacoes';

/** Jornada comercial do seed: intervalo minimo de 60 minutos. */
const COMERCIAL = { intervaloMinimoMinutos: 60 };

function hora(horas: number, minutos = 0): number {
  return horas * 60 + minutos;
}

function digitadas(parcial: MarcacoesDigitadas): MarcacoesDigitadas {
  return parcial;
}

function erros(
  resultado: ReturnType<typeof validarMarcacoes>,
): { campo: string; motivo: string }[] {
  return resultado.valido ? [] : resultado.erros;
}

describe('validarMarcacoes (T-035 / RF-016)', () => {
  describe('ordem cronologica', () => {
    it('aceita o dia comercial completo', () => {
      const resultado = validarMarcacoes(
        digitadas({
          [TipoMarcacao.ENTRADA]: hora(7),
          [TipoMarcacao.SAIDA_INTERVALO]: hora(11),
          [TipoMarcacao.RETORNO_INTERVALO]: hora(12),
          [TipoMarcacao.SAIDA]: hora(17),
        }),
        COMERCIAL,
      );

      expect(resultado.valido).toBe(true);
      if (resultado.valido) {
        expect(resultado.marcacoes.map((item) => item.dias)).toEqual([0, 0, 0, 0]);
        expect(resultado.marcacoes.map((item) => item.absoluto)).toEqual([420, 660, 720, 1020]);
      }
    });

    it('joga para o dia seguinte a saida do turno da noite', () => {
      const resultado = validarMarcacoes(
        digitadas({ [TipoMarcacao.ENTRADA]: hora(22), [TipoMarcacao.SAIDA]: hora(6) }),
        { intervaloMinimoMinutos: 0 },
      );

      expect(resultado.valido).toBe(true);
      if (resultado.valido) {
        const saida = resultado.marcacoes[1];
        expect(saida?.dias).toBe(1);
        expect(saida?.absoluto).toBe(hora(30));
      }
    });

    it('recusa saida anterior a entrada no mesmo turno', () => {
      const resultado = validarMarcacoes(
        digitadas({ [TipoMarcacao.ENTRADA]: hora(8), [TipoMarcacao.SAIDA]: hora(7) }),
        COMERCIAL,
      );

      expect(erros(resultado)[0]?.campo).toBe(TipoMarcacao.SAIDA);
      expect(erros(resultado)[0]?.motivo).toContain('fora de ordem');
    });

    it('recusa duas marcacoes no mesmo horario', () => {
      const resultado = validarMarcacoes(
        digitadas({
          [TipoMarcacao.ENTRADA]: hora(7),
          [TipoMarcacao.SAIDA_INTERVALO]: hora(7),
          [TipoMarcacao.RETORNO_INTERVALO]: hora(12),
        }),
        COMERCIAL,
      );

      expect(erros(resultado)[0]?.campo).toBe(TipoMarcacao.SAIDA_INTERVALO);
      expect(erros(resultado)[0]?.motivo).toContain('igual ao da marcacao anterior');
    });

    it('nunca aceita janela maior que o limite do dia', () => {
      const resultado = validarMarcacoes(
        digitadas({
          [TipoMarcacao.ENTRADA]: hora(7),
          [TipoMarcacao.SAIDA]: hora(6, 59),
        }),
        COMERCIAL,
      );

      expect(resultado.valido).toBe(false);
      expect(PONTO_JANELA_MAXIMA_MINUTOS).toBe(1080);
    });
  });

  describe('completude dos pares', () => {
    it('exige entrada antes das outras marcacoes', () => {
      const resultado = validarMarcacoes(digitadas({ [TipoMarcacao.SAIDA]: hora(17) }), COMERCIAL);

      expect(erros(resultado)[0]?.campo).toBe(TipoMarcacao.ENTRADA);
    });

    it('exige saida e retorno do intervalo juntos', () => {
      const resultado = validarMarcacoes(
        digitadas({ [TipoMarcacao.ENTRADA]: hora(7), [TipoMarcacao.SAIDA_INTERVALO]: hora(11) }),
        COMERCIAL,
      );

      expect(erros(resultado)[0]?.campo).toBe(TipoMarcacao.RETORNO_INTERVALO);
    });

    it('aceita dia sem nenhuma marcacao', () => {
      const resultado = validarMarcacoes(digitadas({}), COMERCIAL);

      expect(resultado.valido).toBe(true);
      if (resultado.valido) {
        expect(resultado.marcacoes).toEqual([]);
      }
    });
  });

  describe('intervalo minimo', () => {
    it('recusa intervalo menor que o da jornada', () => {
      const resultado = validarMarcacoes(
        digitadas({
          [TipoMarcacao.ENTRADA]: hora(7),
          [TipoMarcacao.SAIDA_INTERVALO]: hora(11),
          [TipoMarcacao.RETORNO_INTERVALO]: hora(11, 30),
          [TipoMarcacao.SAIDA]: hora(17),
        }),
        COMERCIAL,
      );

      expect(erros(resultado)[0]?.campo).toBe(TipoMarcacao.RETORNO_INTERVALO);
      expect(erros(resultado)[0]?.motivo).toContain('no minimo 1h');
    });

    it('aceita qualquer intervalo quando a jornada nao preve intervalo', () => {
      const resultado = validarMarcacoes(
        digitadas({
          [TipoMarcacao.ENTRADA]: hora(7),
          [TipoMarcacao.SAIDA_INTERVALO]: hora(11),
          [TipoMarcacao.RETORNO_INTERVALO]: hora(11, 15),
        }),
        { intervaloMinimoMinutos: 0 },
      );

      expect(resultado.valido).toBe(true);
    });
  });

  describe('sobreposicao com o dia vizinho', () => {
    it('recusa entrada dentro do turno que veio do dia anterior', () => {
      const resultado = validarMarcacoes(
        digitadas({ [TipoMarcacao.ENTRADA]: hora(0, 30), [TipoMarcacao.SAIDA]: hora(8) }),
        {
          intervaloMinimoMinutos: 0,
          // Turno da noite do dia anterior: 22:00 do dia -1 ate 01:00 de hoje.
          vizinhas: [{ data: '2026-12-06', inicio: -120, fim: 60 }],
        },
      );

      expect(erros(resultado)[0]?.motivo).toContain('2026-12-06');
    });

    it('aceita quando o turno anterior termina antes da entrada', () => {
      const resultado = validarMarcacoes(
        digitadas({ [TipoMarcacao.ENTRADA]: hora(7), [TipoMarcacao.SAIDA]: hora(17) }),
        {
          intervaloMinimoMinutos: 0,
          vizinhas: [{ data: '2026-12-06', inicio: -540, fim: -60 }],
        },
      );

      expect(resultado.valido).toBe(true);
    });

    it('nao reclama de dia sem marcacao', () => {
      expect(validarSobreposicao([], [{ data: '2026-12-06', inicio: 0, fim: 600 }])).toEqual([]);
    });
  });
});
