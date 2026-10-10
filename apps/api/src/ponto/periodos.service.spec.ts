import { ConflictException, NotFoundException } from '@nestjs/common';
import { StatusPeriodo } from '@sistema/shared';
import { dataIsoParaDate, dateParaDataIso } from '../common/data/data-iso';
import { PeriodosService } from './periodos.service';
import type { PeriodoRegistro, PontoRepository, VinculoVigenteRegistro } from './ponto.repository';

const AGORA = new Date('2026-12-01T12:00:00.000Z');

const PERIODO: PeriodoRegistro = {
  id: 'p-2026-12',
  competencia: '2026-12',
  dataInicio: dataIsoParaDate('2026-12-01'),
  dataFim: dataIsoParaDate('2026-12-31'),
  status: StatusPeriodo.ABERTO,
  fechadoEm: null,
  reabertoEm: null,
  criadoEm: AGORA,
  atualizadoEm: AGORA,
};

const JORNADA = {
  id: 'j-1',
  nome: 'Comercial',
  entradaMinutos: 420,
  saidaMinutos: 1020,
  intervaloMinutos: 60,
  toleranciaMinutos: 10,
  diasSemana: [1, 2, 3, 4, 5],
};

function vinculo(parcial: Partial<VinculoVigenteRegistro>): VinculoVigenteRegistro {
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

describe('PeriodosService (T-031 / RF-013)', () => {
  let vinculos: VinculoVigenteRegistro[];
  let criados: { periodoId: string; funcionarioId: string; data: Date }[];
  let periodos: Map<string, PeriodoRegistro>;
  let servico: PeriodosService;

  function datasDe(funcionarioId: string): string[] {
    return criados
      .filter((dia) => dia.funcionarioId === funcionarioId)
      .map((dia) => dateParaDataIso(dia.data));
  }

  beforeEach(() => {
    vinculos = [vinculo({})];
    criados = [];
    periodos = new Map<string, PeriodoRegistro>();

    const repositorio = {
      buscarPeriodo: jest.fn((id: string) => Promise.resolve(periodos.get(id) ?? null)),
      buscarPeriodoPorCompetencia: jest.fn((competencia: string) =>
        Promise.resolve(
          [...periodos.values()].find((item) => item.competencia === competencia) ?? null,
        ),
      ),
      criarPeriodo: jest.fn((dados: { competencia: string }) => {
        const criado = { ...PERIODO, competencia: dados.competencia };
        periodos.set(criado.id, criado);
        return Promise.resolve(criado);
      }),
      vinculosNoIntervalo: jest.fn(() => Promise.resolve(vinculos)),
      criarDias: jest.fn((itens: { periodoId: string; funcionarioId: string; data: Date }[]) => {
        criados = [...itens];
        return Promise.resolve(itens.length);
      }),
    } as unknown as PontoRepository;

    servico = new PeriodosService(repositorio);
  });

  it('abre o periodo com o mes cheio (RN-01) e gera um dia por data', async () => {
    const resultado = await servico.abrir({ competencia: '2026-12' });

    expect(resultado.periodo.dataInicio).toBe('2026-12-01');
    expect(resultado.periodo.dataFim).toBe('2026-12-31');
    expect(resultado.periodo.status).toBe(StatusPeriodo.ABERTO);
    expect(resultado.funcionarios).toBe(1);
    expect(resultado.diasCriados).toBe(31);
    expect(datasDe('f-ana').at(0)).toBe('2026-12-01');
    expect(datasDe('f-ana').at(-1)).toBe('2026-12-31');
  });

  it('recusa competencia ja aberta', async () => {
    await servico.abrir({ competencia: '2026-12' });

    await expect(servico.abrir({ competencia: '2026-12' })).rejects.toThrow(ConflictException);
  });

  it('comeca na admissao de quem foi admitido no meio do mes', async () => {
    vinculos = [
      vinculo({
        admissao: dataIsoParaDate('2026-12-10'),
        inicioVigencia: dataIsoParaDate('2026-12-10'),
      }),
    ];

    await servico.abrir({ competencia: '2026-12' });

    expect(datasDe('f-ana').at(0)).toBe('2026-12-10');
    expect(datasDe('f-ana')).toHaveLength(22);
  });

  it('para no desligamento e nao gera dia depois dele (RN-12)', async () => {
    vinculos = [
      vinculo({
        desligamento: dataIsoParaDate('2026-12-15'),
        fimVigencia: dataIsoParaDate('2026-12-15'),
      }),
    ];

    await servico.abrir({ competencia: '2026-12' });

    expect(datasDe('f-ana').at(-1)).toBe('2026-12-15');
    expect(datasDe('f-ana')).toHaveLength(15);
  });

  it('nao repete o dia de quem trocou de obra no meio do mes', async () => {
    vinculos = [
      vinculo({ obraId: 'o-centro', fimVigencia: dataIsoParaDate('2026-12-20') }),
      vinculo({ obraId: 'o-litoral', inicioVigencia: dataIsoParaDate('2026-12-15') }),
    ];

    const resultado = await servico.abrir({ competencia: '2026-12' });

    expect(resultado.funcionarios).toBe(1);
    expect(datasDe('f-ana')).toHaveLength(31);
    expect(new Set(datasDe('f-ana')).size).toBe(31);
  });

  it('ignora vinculo cuja vigencia nao alcanca o periodo', async () => {
    vinculos = [
      vinculo({
        inicioVigencia: dataIsoParaDate('2027-01-05'),
        admissao: dataIsoParaDate('2027-01-05'),
      }),
    ];

    const resultado = await servico.abrir({ competencia: '2026-12' });

    expect(resultado.diasCriados).toBe(0);
    expect(resultado.funcionarios).toBe(0);
  });

  it('gera os dias que faltam de um periodo ja aberto', async () => {
    await servico.abrir({ competencia: '2026-12' });
    criados = [];

    const resultado = await servico.gerarDias('p-2026-12');

    expect(resultado.diasCriados).toBe(31);
  });

  it('responde 404 ao gerar dias de periodo inexistente', async () => {
    await expect(servico.gerarDias('p-inexistente')).rejects.toThrow(NotFoundException);
  });
});
