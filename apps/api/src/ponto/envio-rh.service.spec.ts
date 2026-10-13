import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  OcorrenciaDia,
  OrigemMarcacao,
  PerfilUsuario,
  StatusEnvioDia,
  StatusPeriodo,
  TipoMarcacao,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import { dataIsoParaDate } from '../common/data/data-iso';
import { horaLocalParaInstante } from '../common/data/fuso-negocio';
import type { EscopoObraService } from '../obras/escopo-obra.service';
import type { ObrasRepository } from '../obras/obras.repository';
import { EnvioRhService } from './envio-rh.service';
import type {
  DiaPontoRegistro,
  PeriodoRegistro,
  PontoRepository,
  VinculoVigenteRegistro,
} from './ponto.repository';

/**
 * Envio do periodo da equipe ao RH (T-041 / RF-018).
 *
 * O que estes testes travam: o resumo acusa o que falta antes de enviar, o
 * envio alcanca somente a equipe daquela obra, obra fora do escopo nem e lida
 * (RN-05) e periodo fechado nao aceita envio (RN-07).
 */

const OBRA = '019a0000-0000-7000-8000-00000000c001';
const ANA = '019a0000-0000-7000-8000-00000000f001';
const BRUNO = '019a0000-0000-7000-8000-00000000f002';

const PERIODO: PeriodoRegistro = {
  id: '019a0000-0000-7000-8000-00000000e001',
  competencia: '2026-12',
  dataInicio: dataIsoParaDate('2026-12-01'),
  dataFim: dataIsoParaDate('2026-12-31'),
  status: StatusPeriodo.ABERTO,
  fechadoEm: null,
  reabertoEm: null,
  criadoEm: new Date('2026-12-01T00:00:00.000Z'),
  atualizadoEm: new Date('2026-12-01T00:00:00.000Z'),
};

function vinculo(funcionarioId: string, nome: string, matricula: string): VinculoVigenteRegistro {
  return {
    funcionarioId,
    funcionarioNome: nome,
    matricula,
    admissao: dataIsoParaDate('2026-01-05'),
    desligamento: null,
    obraId: OBRA,
    inicioVigencia: dataIsoParaDate('2026-01-05'),
    fimVigencia: null,
    jornada: {
      id: '019a0000-0000-7000-8000-00000000d001',
      nome: 'Comercial',
      entradaMinutos: 420,
      saidaMinutos: 1020,
      intervaloMinutos: 60,
      toleranciaMinutos: 10,
      diasSemana: [1, 2, 3, 4, 5],
    },
  };
}

function dia(
  funcionarioId: string,
  data: string,
  parcial: Partial<DiaPontoRegistro> = {},
): DiaPontoRegistro {
  return {
    id: `${funcionarioId}-${data}`,
    periodoId: PERIODO.id,
    funcionarioId,
    data: dataIsoParaDate(data),
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
    atualizadoEm: new Date('2026-12-08T20:00:00.000Z'),
    ...parcial,
  };
}

/** Dia completo: entrada e saida lancadas. */
function diaCompleto(funcionarioId: string, data: string): DiaPontoRegistro {
  return dia(funcionarioId, data, {
    marcacoes: [
      {
        id: `${funcionarioId}-${data}-e`,
        tipo: TipoMarcacao.ENTRADA,
        horario: horaLocalParaInstante(data, 420),
        origem: OrigemMarcacao.MANUAL,
      },
      {
        id: `${funcionarioId}-${data}-s`,
        tipo: TipoMarcacao.SAIDA,
        horario: horaLocalParaInstante(data, 1020),
        origem: OrigemMarcacao.MANUAL,
      },
    ],
  });
}

function usuario(perfil: PerfilUsuario): UsuarioRequisicao {
  return {
    id: '019a0000-0000-7000-8000-00000000b001',
    perfil,
    sessaoId: '019a0000-0000-7000-8000-00000000b901',
  };
}

describe('EnvioRhService', () => {
  let servico: EnvioRhService;
  let repositorio: {
    buscarPeriodo: jest.Mock;
    vinculosNoIntervalo: jest.Mock;
    diasDoPeriodo: jest.Mock;
    enviarAoRh: jest.Mock;
  };
  let escopo: { garantirAcessoAObra: jest.Mock };
  let periodo: PeriodoRegistro | null;
  let dias: DiaPontoRegistro[];
  let enviados: { periodoId: string; funcionariosIds: readonly string[] } | null;
  /** Liga a recusa do escopo do encarregado (RN-05) no teste que precisa dela. */
  let foraDoEscopo: boolean;

  beforeEach(() => {
    periodo = { ...PERIODO };
    enviados = null;
    foraDoEscopo = false;
    dias = [
      diaCompleto(ANA, '2026-12-01'),
      // Dia normal sem nenhuma marcacao: pendencia de lancamento.
      dia(ANA, '2026-12-02'),
      // Marcacao pela metade: entrou e nao saiu.
      dia(BRUNO, '2026-12-01', {
        marcacoes: [
          {
            id: 'b1',
            tipo: TipoMarcacao.ENTRADA,
            horario: horaLocalParaInstante('2026-12-01', 420),
            origem: OrigemMarcacao.MANUAL,
          },
        ],
      }),
      // Ocorrencia sem trabalho nao e pendencia.
      dia(BRUNO, '2026-12-02', { ocorrencia: OcorrenciaDia.FERIAS }),
      // Dia ja enviado em chamada anterior.
      diaCompleto(BRUNO, '2026-12-03'),
    ];
    dias[4] = { ...(dias[4] as DiaPontoRegistro), statusEnvio: StatusEnvioDia.ENVIADO_RH };

    repositorio = {
      buscarPeriodo: jest.fn(() => Promise.resolve(periodo)),
      vinculosNoIntervalo: jest.fn(() =>
        Promise.resolve([vinculo(BRUNO, 'Bruno Melo', '002'), vinculo(ANA, 'Ana Lima', '001')]),
      ),
      diasDoPeriodo: jest.fn(() => Promise.resolve(dias)),
      enviarAoRh: jest.fn((periodoId: string, funcionariosIds: readonly string[]) => {
        enviados = { periodoId, funcionariosIds };
        const pendentes = dias.filter(
          (item) =>
            item.statusEnvio === StatusEnvioDia.NAO_ENVIADO &&
            funcionariosIds.includes(item.funcionarioId),
        );
        return Promise.resolve({
          diasEnviados: pendentes.length,
          periodo: { ...(periodo as PeriodoRegistro), status: StatusPeriodo.EM_CONFERENCIA },
        });
      }),
    };

    escopo = {
      garantirAcessoAObra: jest.fn(() =>
        foraDoEscopo
          ? Promise.reject(new NotFoundException('Obra nao encontrada.'))
          : Promise.resolve(),
      ),
    };

    const obras = {
      buscarPorId: jest.fn(() => Promise.resolve({ id: OBRA, nome: 'Obra Centro' })),
    } as unknown as ObrasRepository;

    servico = new EnvioRhService(
      repositorio as unknown as PontoRepository,
      escopo as unknown as EscopoObraService,
      obras,
    );
  });

  describe('resumo de pendencias (RF-018)', () => {
    it('acusa dia sem lancamento e dia incompleto, por funcionario', async () => {
      const resumo = await servico.resumo(PERIODO.id, OBRA, usuario(PerfilUsuario.ENCARREGADO));

      expect(resumo.funcionarios).toBe(2);
      expect(resumo.totalPendencias).toBe(2);
      expect(resumo.diasEnviados).toBe(1);
      expect(resumo.diasNaoEnviados).toBe(4);

      const ana = resumo.pendencias.find((item) => item.funcionarioId === ANA);
      expect(ana?.diasSemLancamento).toEqual(['2026-12-02']);

      const bruno = resumo.pendencias.find((item) => item.funcionarioId === BRUNO);
      expect(bruno?.diasIncompletos).toEqual(['2026-12-01']);
      // Ferias nao conta como pendencia de lancamento.
      expect(bruno?.diasSemLancamento).toEqual([]);
    });

    it('ordena a equipe por nome', async () => {
      const resumo = await servico.resumo(PERIODO.id, OBRA, usuario(PerfilUsuario.RH));

      expect(resumo.pendencias[0]?.funcionarioNome).toBe('Ana Lima');
    });

    it('avisa que o encarregado nao pode mais enviar depois da conferencia (RN-06)', async () => {
      periodo = { ...PERIODO, status: StatusPeriodo.EM_CONFERENCIA };

      const resumo = await servico.resumo(PERIODO.id, OBRA, usuario(PerfilUsuario.ENCARREGADO));

      expect(resumo.podeEnviar).toBe(false);
      expect(resumo.motivoBloqueio).toContain('enviado ao RH');
    });

    it('nao le obra fora do escopo do encarregado (RN-05)', async () => {
      foraDoEscopo = true;

      await expect(
        servico.resumo(PERIODO.id, OBRA, usuario(PerfilUsuario.ENCARREGADO)),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repositorio.diasDoPeriodo).not.toHaveBeenCalled();
    });

    it('responde 404 quando o periodo nao existe', async () => {
      periodo = null;

      await expect(
        servico.resumo(PERIODO.id, OBRA, usuario(PerfilUsuario.RH)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('envio (RF-018)', () => {
    it('envia somente os dias da equipe daquela obra', async () => {
      const resposta = await servico.enviar(
        PERIODO.id,
        OBRA,
        usuario(PerfilUsuario.ENCARREGADO),
        new ColetorAuditoria(),
      );

      expect(enviados?.periodoId).toBe(PERIODO.id);
      expect(enviados?.funcionariosIds).toHaveLength(2);
      expect(resposta.diasEnviados).toBe(4);
      expect(resposta.funcionarios).toBe(2);
      expect(resposta.totalPendencias).toBe(2);
      expect(resposta.periodo.status).toBe(StatusPeriodo.EM_CONFERENCIA);
    });

    it('recusa envio em periodo fechado (RN-07)', async () => {
      periodo = { ...PERIODO, status: StatusPeriodo.FECHADO };

      await expect(
        servico.enviar(PERIODO.id, OBRA, usuario(PerfilUsuario.RH), new ColetorAuditoria()),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repositorio.enviarAoRh).not.toHaveBeenCalled();
    });

    it('recusa reenvio pelo encarregado depois da conferencia (RN-06)', async () => {
      periodo = { ...PERIODO, status: StatusPeriodo.EM_CONFERENCIA };

      await expect(
        servico.enviar(
          PERIODO.id,
          OBRA,
          usuario(PerfilUsuario.ENCARREGADO),
          new ColetorAuditoria(),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('anota o envio para a auditoria (RF-005)', async () => {
      const coletor = new ColetorAuditoria();

      await servico.enviar(PERIODO.id, OBRA, usuario(PerfilUsuario.ENCARREGADO), coletor);

      const detalhes = coletor.lerDetalhes();
      expect(detalhes.entidadeId).toBe(PERIODO.id);
      expect(detalhes.depois?.['competencia']).toBe('2026-12');
      expect(detalhes.depois?.['diasEnviados']).toBe(4);
      expect(detalhes.depois?.['pendencias']).toBe(2);
    });
  });
});
