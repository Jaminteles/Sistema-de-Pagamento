import { randomUUID } from 'node:crypto';
import { OcorrenciaDia, StatusEnvioDia, StatusPeriodo } from '@sistema/shared';
import { dataIsoParaDate } from '../src/common/data/data-iso';
import type {
  AjusteDiaGravavel,
  AjusteRegistro,
  DiaPontoRegistro,
  FeriadoDoDia,
  FiltroPeriodos,
  JornadaResumo,
  LancamentoGravavel,
  PeriodoRegistro,
  TotaisGravaveis,
  VinculoVigenteRegistro,
} from '../src/ponto/ponto.repository';

/**
 * Duble em memoria do repositorio de ponto, usado pelo teste de ponta a ponta
 * da sprint 5.
 *
 * Substitui o repositorio (e nao o PrismaService) de proposito: o que o teste
 * precisa exercitar e o caminho HTTP completo - guard de JWT, guard de perfil,
 * DTOs com whitelist, escopo do encarregado (RN-05) e bloqueio por periodo -
 * sem reimplementar a semantica do Prisma e sem PostgreSQL rodando.
 */

const AGORA = new Date('2026-12-07T12:00:00.000Z');

export const JORNADA_COMERCIAL: JornadaResumo = {
  id: '019a0000-0000-7000-8000-00000000d001',
  nome: 'Comercial',
  entradaMinutos: 420,
  saidaMinutos: 1020,
  intervaloMinutos: 60,
  toleranciaMinutos: 10,
  diasSemana: [1, 2, 3, 4, 5],
};

interface SementeVinculo {
  funcionarioId: string;
  funcionarioNome: string;
  matricula: string;
  obraId: string;
  admissao?: string;
  desligamento?: string | null;
  inicioVigencia?: string;
  fimVigencia?: string | null;
  jornada?: JornadaResumo;
}

interface SementeDia {
  id?: string;
  periodoId: string;
  funcionarioId: string;
  data: string;
  ocorrencia?: OcorrenciaDia;
  statusEnvio?: StatusEnvioDia;
}

export class PontoRepositorioEmMemoria {
  readonly periodos: PeriodoRegistro[] = [];
  readonly vinculos: VinculoVigenteRegistro[] = [];
  readonly diasPonto: DiaPontoRegistro[] = [];
  readonly feriadosCadastrados: FeriadoDoDia[] = [];
  /** Historico de ajustes do duble, com o dia a que pertence (RF-017). */
  readonly ajustes: (AjusteRegistro & { diaPontoId: string })[] = [];
  /** Nome do autor do ajuste, so para a linha do tempo do teste. */
  readonly nomePorUsuario = new Map<string, string>();

  semearPeriodo(periodo: {
    id: string;
    competencia: string;
    dataInicio: string;
    dataFim: string;
    status?: StatusPeriodo;
  }): void {
    this.periodos.push({
      id: periodo.id,
      competencia: periodo.competencia,
      dataInicio: dataIsoParaDate(periodo.dataInicio),
      dataFim: dataIsoParaDate(periodo.dataFim),
      status: periodo.status ?? StatusPeriodo.ABERTO,
      fechadoEm: null,
      reabertoEm: null,
      criadoEm: AGORA,
      atualizadoEm: AGORA,
    });
  }

  semearVinculo(semente: SementeVinculo): void {
    this.vinculos.push({
      funcionarioId: semente.funcionarioId,
      funcionarioNome: semente.funcionarioNome,
      matricula: semente.matricula,
      admissao: dataIsoParaDate(semente.admissao ?? '2026-01-05'),
      desligamento: semente.desligamento ? dataIsoParaDate(semente.desligamento) : null,
      obraId: semente.obraId,
      inicioVigencia: dataIsoParaDate(semente.inicioVigencia ?? '2026-01-05'),
      fimVigencia: semente.fimVigencia ? dataIsoParaDate(semente.fimVigencia) : null,
      jornada: semente.jornada ?? JORNADA_COMERCIAL,
    });
  }

  semearDia(semente: SementeDia): DiaPontoRegistro {
    const dia: DiaPontoRegistro = {
      id: semente.id ?? randomUUID(),
      periodoId: semente.periodoId,
      funcionarioId: semente.funcionarioId,
      data: dataIsoParaDate(semente.data),
      ocorrencia: semente.ocorrencia ?? OcorrenciaDia.NORMAL,
      statusEnvio: semente.statusEnvio ?? StatusEnvioDia.NAO_ENVIADO,
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
    };
    this.diasPonto.push(dia);
    return dia;
  }

  semearFeriado(data: string, descricao: string): void {
    this.feriadosCadastrados.push({ data: dataIsoParaDate(data), descricao });
  }

  // -------------------------------------------------------------------------
  // Periodo
  // -------------------------------------------------------------------------

  listarPeriodos(filtro: FiltroPeriodos): Promise<{ itens: PeriodoRegistro[]; total: number }> {
    const itens = this.periodos
      .filter((item) => filtro.status === undefined || item.status === filtro.status)
      .sort((a, b) => b.competencia.localeCompare(a.competencia));

    return Promise.resolve({
      itens: itens.slice(filtro.pular, filtro.pular + filtro.limite),
      total: itens.length,
    });
  }

  buscarPeriodo(id: string): Promise<PeriodoRegistro | null> {
    return Promise.resolve(this.periodos.find((item) => item.id === id) ?? null);
  }

  buscarPeriodoPorCompetencia(competencia: string): Promise<PeriodoRegistro | null> {
    return Promise.resolve(this.periodos.find((item) => item.competencia === competencia) ?? null);
  }

  periodoNaData(data: Date): Promise<PeriodoRegistro | null> {
    return Promise.resolve(
      this.periodos.find((item) => item.dataInicio <= data && item.dataFim >= data) ?? null,
    );
  }

  periodosNoIntervalo(inicio: Date, fim: Date): Promise<PeriodoRegistro[]> {
    return Promise.resolve(
      this.periodos.filter((item) => item.dataInicio <= fim && item.dataFim >= inicio),
    );
  }

  criarPeriodo(dados: {
    competencia: string;
    dataInicio: Date;
    dataFim: Date;
  }): Promise<PeriodoRegistro> {
    const criado: PeriodoRegistro = {
      id: randomUUID(),
      competencia: dados.competencia,
      dataInicio: dados.dataInicio,
      dataFim: dados.dataFim,
      status: StatusPeriodo.ABERTO,
      fechadoEm: null,
      reabertoEm: null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };
    this.periodos.push(criado);
    return Promise.resolve(criado);
  }

  criarDias(
    itens: readonly { periodoId: string; funcionarioId: string; data: Date }[],
  ): Promise<number> {
    let criados = 0;
    for (const item of itens) {
      const existe = this.diasPonto.some(
        (dia) =>
          dia.funcionarioId === item.funcionarioId && dia.data.getTime() === item.data.getTime(),
      );
      if (existe) {
        continue;
      }
      this.semearDia({
        periodoId: item.periodoId,
        funcionarioId: item.funcionarioId,
        data: item.data.toISOString().slice(0, 10),
      });
      criados += 1;
    }
    return Promise.resolve(criados);
  }

  // -------------------------------------------------------------------------
  // Consultas de lancamento
  // -------------------------------------------------------------------------

  private vigenteEm(vinculo: VinculoVigenteRegistro, inicio: Date, fim: Date): boolean {
    return (
      vinculo.inicioVigencia <= fim &&
      (vinculo.fimVigencia === null || vinculo.fimVigencia >= inicio)
    );
  }

  equipeDaObra(obraId: string, data: Date): Promise<VinculoVigenteRegistro[]> {
    return Promise.resolve(
      this.vinculos
        .filter((item) => item.obraId === obraId && this.vigenteEm(item, data, data))
        .sort((a, b) => a.funcionarioNome.localeCompare(b.funcionarioNome)),
    );
  }

  vinculosNoIntervalo(
    inicio: Date,
    fim: Date,
    filtro: {
      obrasPermitidas?: readonly string[];
      funcionarioId?: string;
      funcionariosIds?: readonly string[];
    } = {},
  ): Promise<VinculoVigenteRegistro[]> {
    return Promise.resolve(
      this.vinculos.filter(
        (item) =>
          this.vigenteEm(item, inicio, fim) &&
          (filtro.obrasPermitidas === undefined || filtro.obrasPermitidas.includes(item.obraId)) &&
          (filtro.funcionarioId === undefined || filtro.funcionarioId === item.funcionarioId) &&
          (filtro.funcionariosIds === undefined ||
            filtro.funcionariosIds.includes(item.funcionarioId)),
      ),
    );
  }

  dias(funcionariosIds: readonly string[], inicio: Date, fim: Date): Promise<DiaPontoRegistro[]> {
    return Promise.resolve(
      this.diasPonto
        .filter(
          (dia) =>
            funcionariosIds.includes(dia.funcionarioId) && dia.data >= inicio && dia.data <= fim,
        )
        .sort((a, b) => a.data.getTime() - b.data.getTime()),
    );
  }

  feriados(inicio: Date, fim: Date): Promise<FeriadoDoDia[]> {
    return Promise.resolve(
      this.feriadosCadastrados.filter((item) => item.data >= inicio && item.data <= fim),
    );
  }

  // -------------------------------------------------------------------------
  // Gravacao
  // -------------------------------------------------------------------------

  salvar(lancamentos: readonly LancamentoGravavel[]): Promise<DiaPontoRegistro[]> {
    const salvos: DiaPontoRegistro[] = [];

    for (const lancamento of lancamentos) {
      let dia = this.diasPonto.find(
        (item) =>
          item.funcionarioId === lancamento.funcionarioId &&
          item.data.getTime() === lancamento.data.getTime(),
      );

      if (!dia) {
        dia = this.semearDia({
          periodoId: lancamento.periodoId,
          funcionarioId: lancamento.funcionarioId,
          data: lancamento.data.toISOString().slice(0, 10),
        });
      }

      dia.ocorrencia = lancamento.ocorrencia;
      dia.observacao = lancamento.observacao;

      for (const marcacao of lancamento.marcacoes) {
        const existente = dia.marcacoes.find((item) => item.tipo === marcacao.tipo);
        if (existente) {
          existente.horario = marcacao.horario;
          existente.origem = marcacao.origem;
        } else {
          dia.marcacoes.push({
            id: randomUUID(),
            tipo: marcacao.tipo,
            horario: marcacao.horario,
            origem: marcacao.origem,
          });
        }
      }

      dia.marcacoes = dia.marcacoes
        .filter((item) => !lancamento.remover.includes(item.tipo))
        .sort((a, b) => a.horario.getTime() - b.horario.getTime());

      salvos.push(dia);
    }

    return Promise.resolve(salvos);
  }

  // -------------------------------------------------------------------------
  // Sprint 6: ajuste (RF-017), envio ao RH (RF-018) e apuracao (RF-020)
  // -------------------------------------------------------------------------

  buscarDia(id: string): Promise<DiaPontoRegistro | null> {
    return Promise.resolve(this.diasPonto.find((dia) => dia.id === id) ?? null);
  }

  diasDoPeriodo(
    periodoId: string,
    funcionariosIds?: readonly string[],
  ): Promise<DiaPontoRegistro[]> {
    return Promise.resolve(
      this.diasPonto
        .filter(
          (dia) =>
            dia.periodoId === periodoId &&
            (funcionariosIds === undefined || funcionariosIds.includes(dia.funcionarioId)),
        )
        .sort((a, b) => a.data.getTime() - b.data.getTime()),
    );
  }

  ajustar(ajuste: AjusteDiaGravavel): Promise<DiaPontoRegistro> {
    const dia = this.diasPonto.find((item) => item.id === ajuste.diaPontoId);
    if (!dia) {
      return Promise.reject(new Error('dia de ponto inexistente no duble'));
    }

    dia.ocorrencia = ajuste.ocorrencia;
    dia.observacao = ajuste.observacao;

    for (const marcacao of ajuste.marcacoes) {
      const existente = dia.marcacoes.find((item) => item.tipo === marcacao.tipo);
      if (existente) {
        existente.horario = marcacao.horario;
        existente.origem = marcacao.origem;
      } else {
        dia.marcacoes.push({
          id: randomUUID(),
          tipo: marcacao.tipo,
          horario: marcacao.horario,
          origem: marcacao.origem,
        });
      }
    }

    dia.marcacoes = dia.marcacoes
      .filter((item) => !ajuste.remover.includes(item.tipo))
      .sort((a, b) => a.horario.getTime() - b.horario.getTime());

    for (const alteracao of ajuste.alteracoes) {
      this.ajustes.push({
        id: randomUUID(),
        diaPontoId: ajuste.diaPontoId,
        campo: alteracao.campo,
        valorAnterior: alteracao.valorAnterior ?? null,
        valorNovo: alteracao.valorNovo ?? null,
        textoAnterior: alteracao.textoAnterior ?? null,
        textoNovo: alteracao.textoNovo ?? null,
        justificativa: ajuste.justificativa,
        usuarioNome: this.nomePorUsuario.get(ajuste.usuarioId) ?? 'Usuario',
        criadoEm: new Date(),
      });
    }

    return Promise.resolve(dia);
  }

  historicoDoDia(diaPontoId: string, limite: number): Promise<AjusteRegistro[]> {
    return Promise.resolve(
      this.ajustes
        .filter((ajuste) => ajuste.diaPontoId === diaPontoId)
        .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
        .slice(0, limite)
        .map(({ diaPontoId: _ignorado, ...registro }) => registro),
    );
  }

  enviarAoRh(
    periodoId: string,
    funcionariosIds: readonly string[],
  ): Promise<{ diasEnviados: number; periodo: PeriodoRegistro }> {
    const periodo = this.periodos.find((item) => item.id === periodoId) as PeriodoRegistro;
    let diasEnviados = 0;

    for (const dia of this.diasPonto) {
      if (
        dia.periodoId === periodoId &&
        funcionariosIds.includes(dia.funcionarioId) &&
        dia.statusEnvio === StatusEnvioDia.NAO_ENVIADO
      ) {
        dia.statusEnvio = StatusEnvioDia.ENVIADO_RH;
        diasEnviados += 1;
      }
    }

    const pendentes = this.diasPonto.filter(
      (dia) => dia.periodoId === periodoId && dia.statusEnvio === StatusEnvioDia.NAO_ENVIADO,
    ).length;

    if (pendentes === 0) {
      periodo.status = StatusPeriodo.EM_CONFERENCIA;
    }

    return Promise.resolve({ diasEnviados, periodo });
  }

  salvarTotais(itens: readonly TotaisGravaveis[], apuradoEm: Date): Promise<number> {
    for (const item of itens) {
      const dia = this.diasPonto.find((registro) => registro.id === item.diaPontoId);
      if (dia) {
        Object.assign(dia, item.totais, { apuradoEm });
      }
    }
    return Promise.resolve(itens.length);
  }
}
