import {
  OcorrenciaDia,
  OrigemMarcacao,
  PerfilUsuario,
  StatusEnvioDia,
  StatusPeriodo,
  TipoMarcacao,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import { dataIsoParaDate } from '../common/data/data-iso';
import { horaLocalParaInstante } from '../common/data/fuso-negocio';
import { type EntradaLancamento, LancamentoService } from './lancamento.service';
import type {
  DiaPontoRegistro,
  LancamentoGravavel,
  PeriodoRegistro,
  PontoRepository,
  VinculoVigenteRegistro,
} from './ponto.repository';

const AGORA = new Date('2026-12-07T12:00:00.000Z');
const DIA = '2026-12-07';

const JORNADA = {
  id: 'j-1',
  nome: 'Comercial',
  entradaMinutos: 420,
  saidaMinutos: 1020,
  intervaloMinutos: 60,
  toleranciaMinutos: 10,
  diasSemana: [1, 2, 3, 4, 5],
};

function usuario(perfil: PerfilUsuario): UsuarioRequisicao {
  return { id: `u-${perfil}`, perfil, sessaoId: 's-1' };
}

function periodo(parcial: Partial<PeriodoRegistro> = {}): PeriodoRegistro {
  return {
    id: 'p-2026-12',
    competencia: '2026-12',
    dataInicio: dataIsoParaDate('2026-12-01'),
    dataFim: dataIsoParaDate('2026-12-31'),
    status: StatusPeriodo.ABERTO,
    fechadoEm: null,
    reabertoEm: null,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
    ...parcial,
  };
}

function vinculo(parcial: Partial<VinculoVigenteRegistro> = {}): VinculoVigenteRegistro {
  return {
    funcionarioId: 'f-ana',
    funcionarioNome: 'Ana Lima',
    matricula: '001',
    admissao: dataIsoParaDate('2026-01-05'),
    desligamento: null,
    obraId: 'o-centro',
    inicioVigencia: dataIsoParaDate('2026-01-05'),
    fimVigencia: null,
    jornada: JORNADA,
    ...parcial,
  };
}

function dia(parcial: Partial<DiaPontoRegistro> = {}): DiaPontoRegistro {
  return {
    id: 'd-1',
    periodoId: 'p-2026-12',
    funcionarioId: 'f-ana',
    data: dataIsoParaDate(DIA),
    ocorrencia: OcorrenciaDia.NORMAL,
    statusEnvio: StatusEnvioDia.NAO_ENVIADO,
    minutosTrabalhados: 0,
    minutosExtras50: 0,
    minutosExtras100: 0,
    minutosNoturnos: 0,
    minutosAtraso: 0,
    minutosFalta: 0,
    apuradoEm: null,
    observacao: null,
    marcacoes: [],
    atualizadoEm: AGORA,
    ...parcial,
  };
}

function entrada(parcial: Partial<EntradaLancamento> = {}): EntradaLancamento {
  return {
    funcionarioId: 'f-ana',
    data: dataIsoParaDate(DIA),
    horarios: {},
    ...parcial,
  };
}

/** Marcacao gravada, montada a partir da hora local como o banco guardaria. */
function marcacaoGravada(tipo: TipoMarcacao, hora: string) {
  const [horas, minutos] = hora.split(':').map(Number) as [number, number];
  return {
    id: `m-${tipo}`,
    tipo,
    horario: horaLocalParaInstante(DIA, horas * 60 + minutos),
    origem: OrigemMarcacao.MANUAL,
  };
}

describe('LancamentoService (T-032 a T-035)', () => {
  let periodos: PeriodoRegistro[];
  let vinculos: VinculoVigenteRegistro[];
  let diasGravados: DiaPontoRegistro[];
  let salvos: LancamentoGravavel[];
  let servico: LancamentoService;

  beforeEach(() => {
    periodos = [periodo()];
    vinculos = [vinculo()];
    diasGravados = [];
    salvos = [];

    const repositorio = {
      periodosNoIntervalo: jest.fn(() => Promise.resolve(periodos)),
      vinculosNoIntervalo: jest.fn(
        (_inicio: Date, _fim: Date, filtro: { obrasPermitidas?: readonly string[] } = {}) =>
          Promise.resolve(
            filtro.obrasPermitidas === undefined
              ? vinculos
              : vinculos.filter((item) => filtro.obrasPermitidas?.includes(item.obraId)),
          ),
      ),
      dias: jest.fn(() => Promise.resolve(diasGravados)),
      salvar: jest.fn((lancamentos: LancamentoGravavel[]) => {
        salvos = [...lancamentos];
        return Promise.resolve(
          lancamentos.map((lancamento, indice) =>
            dia({
              id: `d-salvo-${indice}`,
              funcionarioId: lancamento.funcionarioId,
              data: lancamento.data,
              ocorrencia: lancamento.ocorrencia,
              observacao: lancamento.observacao,
              marcacoes: lancamento.marcacoes.map((marcacao) => ({
                id: `m-${marcacao.tipo}`,
                tipo: marcacao.tipo,
                horario: marcacao.horario,
                origem: OrigemMarcacao.MANUAL,
              })),
            }),
          ),
        );
      }),
    } as unknown as PontoRepository;

    servico = new LancamentoService(repositorio);
  });

  const semEscopo = { obrasPermitidas: null };

  describe('gravacao (RF-013)', () => {
    it('grava as marcacoes no fuso de negocio (RNF-12)', async () => {
      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.ENCARREGADO),
        [
          entrada({
            horarios: {
              [TipoMarcacao.ENTRADA]: '07:00',
              [TipoMarcacao.SAIDA_INTERVALO]: '11:00',
              [TipoMarcacao.RETORNO_INTERVALO]: '12:00',
              [TipoMarcacao.SAIDA]: '17:00',
            },
          }),
        ],
        semEscopo,
      );

      expect(resultado.erros).toEqual([]);
      expect(resultado.salvos).toBe(1);
      // America/Bahia e UTC-3: 07:00 local vira 10:00Z.
      expect(salvos[0]?.marcacoes[0]?.horario.toISOString()).toBe('2026-12-07T10:00:00.000Z');
      expect(salvos[0]?.remover).toEqual([]);
    });

    it('mantem a marcacao gravada quando o campo nao vem e apaga quando vem null', async () => {
      diasGravados = [
        dia({
          marcacoes: [
            marcacaoGravada(TipoMarcacao.ENTRADA, '07:00'),
            marcacaoGravada(TipoMarcacao.SAIDA, '17:00'),
          ],
        }),
      ];

      await servico.aplicar(
        usuario(PerfilUsuario.RH),
        [entrada({ horarios: { [TipoMarcacao.SAIDA]: null } })],
        semEscopo,
      );

      expect(salvos[0]?.marcacoes.map((item) => item.tipo)).toEqual([TipoMarcacao.ENTRADA]);
      expect(salvos[0]?.remover).toContain(TipoMarcacao.SAIDA);
    });

    it('grava os dias validos e devolve o erro das linhas recusadas', async () => {
      vinculos = [vinculo(), vinculo({ funcionarioId: 'f-bruno', matricula: '002' })];

      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.RH),
        [
          entrada({ horarios: { [TipoMarcacao.ENTRADA]: '07:00' } }),
          entrada({
            funcionarioId: 'f-bruno',
            horarios: { [TipoMarcacao.ENTRADA]: '08:00', [TipoMarcacao.SAIDA]: '07:00' },
          }),
        ],
        semEscopo,
      );

      expect(resultado.salvos).toBe(1);
      expect(resultado.erros).toHaveLength(1);
      expect(resultado.erros[0]?.funcionarioId).toBe('f-bruno');
    });
  });

  describe('bloqueios de periodo (RN-06 e RN-07)', () => {
    it('recusa escrita em periodo fechado, para qualquer perfil', async () => {
      periodos = [periodo({ status: StatusPeriodo.FECHADO })];

      for (const perfil of [PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO]) {
        const resultado = await servico.aplicar(
          usuario(perfil),
          [entrada({ horarios: { [TipoMarcacao.ENTRADA]: '07:00' } })],
          semEscopo,
        );

        expect(resultado.salvos).toBe(0);
        expect(resultado.erros[0]?.campo).toBe('DIA');
        expect(resultado.erros[0]?.motivo).toContain('fechado');
      }
    });

    it('bloqueia o encarregado no dia ja enviado ao RH e libera o RH', async () => {
      diasGravados = [dia({ statusEnvio: StatusEnvioDia.ENVIADO_RH })];
      const horarios = { [TipoMarcacao.ENTRADA]: '07:00' };

      const doEncarregado = await servico.aplicar(
        usuario(PerfilUsuario.ENCARREGADO),
        [entrada({ horarios })],
        semEscopo,
      );
      const doRh = await servico.aplicar(
        usuario(PerfilUsuario.RH),
        [entrada({ horarios })],
        semEscopo,
      );

      expect(doEncarregado.salvos).toBe(0);
      expect(doEncarregado.erros[0]?.motivo).toContain('enviado ao RH');
      expect(doRh.salvos).toBe(1);
    });

    it('bloqueia o encarregado quando o periodo esta em conferencia do RH', async () => {
      periodos = [periodo({ status: StatusPeriodo.EM_CONFERENCIA })];

      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.ENCARREGADO),
        [entrada({ horarios: { [TipoMarcacao.ENTRADA]: '07:00' } })],
        semEscopo,
      );

      expect(resultado.salvos).toBe(0);
      expect(resultado.erros[0]?.motivo).toContain('enviado ao RH');
    });

    it('recusa data sem periodo de apuracao', async () => {
      periodos = [];

      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.RH),
        [entrada({ horarios: { [TipoMarcacao.ENTRADA]: '07:00' } })],
        semEscopo,
      );

      expect(resultado.salvos).toBe(0);
      expect(resultado.erros[0]?.motivo).toContain('periodo');
    });

    it('recusa perfil que nao lanca ponto, mesmo chamando o service direto', async () => {
      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.FINANCEIRO),
        [entrada({ horarios: { [TipoMarcacao.ENTRADA]: '07:00' } })],
        semEscopo,
      );

      expect(resultado.salvos).toBe(0);
      expect(resultado.erros[0]?.motivo).toContain('Perfil sem permissao');
    });
  });

  describe('escopo do encarregado (RN-05) e cadastro (RN-12)', () => {
    it('recusa funcionario de obra que nao e do encarregado', async () => {
      vinculos = [vinculo({ obraId: 'o-litoral' })];

      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.ENCARREGADO),
        [entrada({ horarios: { [TipoMarcacao.ENTRADA]: '07:00' } })],
        { obrasPermitidas: ['o-centro'] },
      );

      expect(resultado.salvos).toBe(0);
      expect(resultado.erros[0]?.motivo).toContain('sem vinculo');
    });

    it('recusa qualquer lancamento do encarregado sem obra vinculada', async () => {
      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.ENCARREGADO),
        [entrada({ horarios: { [TipoMarcacao.ENTRADA]: '07:00' } })],
        { obrasPermitidas: [] },
      );

      expect(resultado.salvos).toBe(0);
      expect(resultado.erros[0]?.motivo).toContain('sem vinculo');
    });

    it('recusa lancamento depois do desligamento (RN-12)', async () => {
      vinculos = [vinculo({ desligamento: dataIsoParaDate('2026-12-05') })];

      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.RH),
        [entrada({ horarios: { [TipoMarcacao.ENTRADA]: '07:00' } })],
        semEscopo,
      );

      expect(resultado.erros[0]?.motivo).toContain('desligado');
    });

    it('recusa lancamento antes da admissao', async () => {
      vinculos = [vinculo({ admissao: dataIsoParaDate('2026-12-20') })];

      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.RH),
        [entrada({ horarios: { [TipoMarcacao.ENTRADA]: '07:00' } })],
        semEscopo,
      );

      expect(resultado.erros[0]?.motivo).toContain('admissao');
    });
  });

  describe('ocorrencias do dia (RF-015)', () => {
    it('apaga as marcacoes gravadas quando o dia passa a ser falta', async () => {
      diasGravados = [dia({ marcacoes: [marcacaoGravada(TipoMarcacao.ENTRADA, '07:00')] })];

      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.RH),
        [entrada({ ocorrencia: OcorrenciaDia.FALTA })],
        semEscopo,
      );

      expect(resultado.salvos).toBe(1);
      expect(salvos[0]?.ocorrencia).toBe(OcorrenciaDia.FALTA);
      expect(salvos[0]?.marcacoes).toEqual([]);
      expect(salvos[0]?.remover).toHaveLength(4);
    });

    it('recusa ocorrencia sem trabalho junto de horario', async () => {
      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.RH),
        [
          entrada({
            ocorrencia: OcorrenciaDia.FERIAS,
            horarios: { [TipoMarcacao.ENTRADA]: '07:00' },
          }),
        ],
        semEscopo,
      );

      expect(resultado.salvos).toBe(0);
      expect(resultado.erros[0]?.campo).toBe('OCORRENCIA');
    });

    it('mantem a ocorrencia gravada quando o campo nao vem', async () => {
      diasGravados = [dia({ ocorrencia: OcorrenciaDia.ATESTADO })];

      await servico.aplicar(usuario(PerfilUsuario.RH), [entrada({})], semEscopo);

      expect(salvos[0]?.ocorrencia).toBe(OcorrenciaDia.ATESTADO);
    });
  });

  describe('sobreposicao entre dias (RF-016)', () => {
    it('recusa o dia que invade o turno gravado no dia anterior', async () => {
      diasGravados = [
        dia({
          id: 'd-anterior',
          data: dataIsoParaDate('2026-12-06'),
          marcacoes: [
            {
              id: 'm-ent',
              tipo: TipoMarcacao.ENTRADA,
              horario: horaLocalParaInstante('2026-12-06', 22 * 60),
              origem: OrigemMarcacao.MANUAL,
            },
            {
              id: 'm-sai',
              tipo: TipoMarcacao.SAIDA,
              horario: horaLocalParaInstante('2026-12-06', 30 * 60),
              origem: OrigemMarcacao.MANUAL,
            },
          ],
        }),
      ];

      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.RH),
        [
          entrada({
            horarios: { [TipoMarcacao.ENTRADA]: '05:00', [TipoMarcacao.SAIDA]: '14:00' },
          }),
        ],
        semEscopo,
      );

      expect(resultado.salvos).toBe(0);
      expect(resultado.erros[0]?.motivo).toContain('2026-12-06');
    });

    it('aceita dois dias corrigidos na mesma chamada sem acusar conflito com o valor antigo', async () => {
      diasGravados = [
        dia({
          id: 'd-anterior',
          data: dataIsoParaDate('2026-12-06'),
          marcacoes: [
            {
              id: 'm-ent',
              tipo: TipoMarcacao.ENTRADA,
              horario: horaLocalParaInstante('2026-12-06', 22 * 60),
              origem: OrigemMarcacao.MANUAL,
            },
            {
              id: 'm-sai',
              tipo: TipoMarcacao.SAIDA,
              horario: horaLocalParaInstante('2026-12-06', 30 * 60),
              origem: OrigemMarcacao.MANUAL,
            },
          ],
        }),
      ];

      const resultado = await servico.aplicar(
        usuario(PerfilUsuario.RH),
        [
          entrada({
            data: dataIsoParaDate('2026-12-06'),
            horarios: { [TipoMarcacao.ENTRADA]: '07:00', [TipoMarcacao.SAIDA]: '16:00' },
          }),
          entrada({
            horarios: { [TipoMarcacao.ENTRADA]: '05:00', [TipoMarcacao.SAIDA]: '14:00' },
          }),
        ],
        semEscopo,
      );

      expect(resultado.erros).toEqual([]);
      expect(resultado.salvos).toBe(2);
    });
  });
});
