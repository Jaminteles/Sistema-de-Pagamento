import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type ErroLancamentoResponse,
  type GradeEquipeResponse,
  type JornadaResumoResponse,
  type LancarPontoResponse,
  type LinhaGradeResponse,
  PONTO_MAXIMO_DIAS_CONSULTA,
  type PontoFuncionarioResponse,
  TipoMarcacao,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import {
  dataIsoParaDate,
  datasDoIntervalo,
  dateParaDataIso,
  diaSemanaIso,
} from '../common/data/data-iso';
import { hojeNoFusoDeNegocio } from '../common/data/fuso-negocio';
import { EscopoFuncionarioService } from '../funcionarios/escopo-funcionario.service';
import { FuncionariosRepository } from '../funcionarios/funcionarios.repository';
import { EscopoObraService } from '../obras/escopo-obra.service';
import { ObrasRepository } from '../obras/obras.repository';
import type { GradeQuery } from './dto/grade.query';
import type { IntervaloQuery } from './dto/intervalo.query';
import type { LancarEquipeDto } from './dto/lancar-equipe.dto';
import type { LancarFuncionarioDto } from './dto/lancar-funcionario.dto';
import { type EntradaLancamento, LancamentoService } from './lancamento.service';
import {
  paraDiaResponse,
  paraJornadaResumo,
  paraPeriodoResponse,
  podeEscrever,
  quantidadeDeDias,
  somarTotais,
} from './ponto.resposta';
import {
  type DiaPontoRegistro,
  type PeriodoRegistro,
  PontoRepository,
  type VinculoVigenteRegistro,
} from './ponto.repository';

/** Horarios de um item de lancamento, no formato que o service de lancamento usa. */
function horariosDoItem(item: {
  entrada?: string | null;
  saidaIntervalo?: string | null;
  retornoIntervalo?: string | null;
  saida?: string | null;
}): Partial<Record<TipoMarcacao, string | null>> {
  const horarios: Partial<Record<TipoMarcacao, string | null>> = {};
  if (item.entrada !== undefined) {
    horarios[TipoMarcacao.ENTRADA] = item.entrada;
  }
  if (item.saidaIntervalo !== undefined) {
    horarios[TipoMarcacao.SAIDA_INTERVALO] = item.saidaIntervalo;
  }
  if (item.retornoIntervalo !== undefined) {
    horarios[TipoMarcacao.RETORNO_INTERVALO] = item.retornoIntervalo;
  }
  if (item.saida !== undefined) {
    horarios[TipoMarcacao.SAIDA] = item.saida;
  }
  return horarios;
}

/**
 * Consulta e lancamento de ponto pelas duas visoes da sprint 5: grade por
 * equipe e dia (RF-013) e semana ou mes de um funcionario (RF-014).
 *
 * O escopo do encarregado (RN-05) e aplicado aqui, sempre a partir do usuario
 * autenticado: a obra vem do EscopoObraService e o funcionario do
 * EscopoFuncionarioService. Nenhum id de rota, corpo ou query amplia o alcance.
 */
@Injectable()
export class PontoService {
  constructor(
    private readonly repositorio: PontoRepository,
    private readonly lancamento: LancamentoService,
    private readonly escopoObra: EscopoObraService,
    private readonly escopoFuncionario: EscopoFuncionarioService,
    private readonly obras: ObrasRepository,
    private readonly funcionarios: FuncionariosRepository,
  ) {}

  // -------------------------------------------------------------------------
  // RF-013 - grade por equipe e dia
  // -------------------------------------------------------------------------

  async grade(query: GradeQuery, usuario: UsuarioRequisicao): Promise<GradeEquipeResponse> {
    await this.escopoObra.garantirAcessoAObra(usuario, query.obraId);

    const obra = await this.obras.buscarPorId(query.obraId);
    if (!obra) {
      throw new NotFoundException('Obra nao encontrada.');
    }

    const data = dataIsoParaDate(query.data);
    const equipe = this.equipeDoDia(await this.repositorio.equipeDaObra(query.obraId, data), data);
    const ids = equipe.map((vinculo) => vinculo.funcionarioId);

    const [periodo, dias, feriados] = await Promise.all([
      this.repositorio.periodoNaData(data),
      this.repositorio.dias(ids, data, data),
      this.repositorio.feriados(data, data),
    ]);

    const porFuncionario = new Map(dias.map((dia) => [dia.funcionarioId, dia]));

    const linhas: LinhaGradeResponse[] = equipe.map((vinculo) => {
      const dia = porFuncionario.get(vinculo.funcionarioId) ?? null;
      return {
        funcionarioId: vinculo.funcionarioId,
        funcionarioNome: vinculo.funcionarioNome,
        matricula: vinculo.matricula,
        jornada: paraJornadaResumo(vinculo.jornada),
        dia: dia ? paraDiaResponse(dia, podeEscrever(usuario, periodo, dia)) : null,
      };
    });

    return {
      data: query.data,
      obraId: obra.id,
      obraNome: obra.nome,
      periodo: periodo ? paraPeriodoResponse(periodo) : null,
      feriado: feriados[0]?.descricao ?? null,
      diaSemana: diaSemanaIso(data),
      linhas,
      editavel: podeEscrever(usuario, periodo, null),
    };
  }

  async lancarEquipe(
    dto: LancarEquipeDto,
    usuario: UsuarioRequisicao,
  ): Promise<LancarPontoResponse> {
    await this.escopoObra.garantirAcessoAObra(usuario, dto.obraId);

    const data = dataIsoParaDate(dto.data);
    const equipe = this.equipeDoDia(await this.repositorio.equipeDaObra(dto.obraId, data), data);
    const naEquipe = new Set(equipe.map((vinculo) => vinculo.funcionarioId));

    const erros: ErroLancamentoResponse[] = [];
    const entradas: EntradaLancamento[] = [];

    for (const item of dto.itens) {
      // A grade e de uma obra: id de funcionario de fora dela nao e gravado nem
      // pelo ADMIN, que nao tem escopo restrito. Vale como defesa em
      // profundidade junto do recorte por obra (RN-05).
      if (!naEquipe.has(item.funcionarioId)) {
        erros.push({
          funcionarioId: item.funcionarioId,
          data: dto.data,
          campo: 'DIA',
          motivo: 'Funcionario nao esta na equipe desta obra neste dia.',
        });
        continue;
      }

      entradas.push({
        funcionarioId: item.funcionarioId,
        data,
        ...(item.ocorrencia === undefined ? {} : { ocorrencia: item.ocorrencia }),
        ...(item.observacao === undefined ? {} : { observacao: item.observacao }),
        horarios: horariosDoItem(item),
      });
    }

    const resultado = await this.lancamento.aplicar(usuario, entradas, {
      obrasPermitidas: await this.escopoObra.obrasPermitidas(usuario),
    });

    return { ...resultado, erros: [...erros, ...resultado.erros] };
  }

  // -------------------------------------------------------------------------
  // RF-014 - visao por funcionario
  // -------------------------------------------------------------------------

  async porFuncionario(
    funcionarioId: string,
    query: IntervaloQuery,
    usuario: UsuarioRequisicao,
  ): Promise<PontoFuncionarioResponse> {
    await this.escopoFuncionario.garantirAcesso(usuario, funcionarioId);

    const funcionario = await this.funcionarios.buscarPorId(funcionarioId, hojeNoFusoDeNegocio());
    if (!funcionario) {
      throw new NotFoundException('Funcionario nao encontrado.');
    }

    const inicio = dataIsoParaDate(query.inicio);
    const fim = dataIsoParaDate(query.fim);
    this.validarIntervalo(inicio, fim);

    const [periodos, dias, feriados, vinculos] = await Promise.all([
      this.repositorio.periodosNoIntervalo(inicio, fim),
      this.repositorio.dias([funcionarioId], inicio, fim),
      this.repositorio.feriados(inicio, fim),
      this.repositorio.vinculosNoIntervalo(inicio, fim, { funcionarioId }),
    ]);

    const resposta = dias.map((dia) =>
      paraDiaResponse(dia, podeEscrever(usuario, this.periodoDoDia(periodos, dia), dia)),
    );

    return {
      funcionarioId,
      funcionarioNome: funcionario.nome,
      matricula: funcionario.matricula,
      inicio: query.inicio,
      fim: query.fim,
      periodos: periodos.map(paraPeriodoResponse),
      dias: resposta,
      jornadaPorDia: this.jornadaPorDia(vinculos, inicio, fim),
      feriados: Object.fromEntries(
        feriados.map((feriado) => [dateParaDataIso(feriado.data), feriado.descricao]),
      ),
      totais: somarTotais(resposta),
    };
  }

  async lancarFuncionario(
    funcionarioId: string,
    dto: LancarFuncionarioDto,
    usuario: UsuarioRequisicao,
  ): Promise<LancarPontoResponse> {
    await this.escopoFuncionario.garantirAcesso(usuario, funcionarioId);

    const entradas: EntradaLancamento[] = dto.dias.map((item) => ({
      // O id vem da rota, que e o que passou pelo escopo (RN-05); o corpo nao
      // carrega funcionarioId justamente para nao abrir essa porta.
      funcionarioId,
      data: dataIsoParaDate(item.data),
      ...(item.ocorrencia === undefined ? {} : { ocorrencia: item.ocorrencia }),
      ...(item.observacao === undefined ? {} : { observacao: item.observacao }),
      horarios: horariosDoItem(item),
    }));

    return this.lancamento.aplicar(usuario, entradas, {
      obrasPermitidas: await this.escopoObra.obrasPermitidas(usuario),
    });
  }

  // -------------------------------------------------------------------------
  // Apoio
  // -------------------------------------------------------------------------

  /**
   * Quem aparece na grade daquele dia.
   *
   * Fica de fora quem ainda nao foi admitido e quem ja estava desligado na
   * data: o desligado continua visivel nos dias em que trabalhou (RN-12), mas
   * nao no dia seguinte ao desligamento.
   */
  private equipeDoDia(
    equipe: readonly VinculoVigenteRegistro[],
    data: Date,
  ): VinculoVigenteRegistro[] {
    return equipe.filter(
      (vinculo) =>
        vinculo.admissao <= data && (vinculo.desligamento === null || vinculo.desligamento >= data),
    );
  }

  private periodoDoDia(
    periodos: readonly PeriodoRegistro[],
    dia: DiaPontoRegistro,
  ): PeriodoRegistro | null {
    return periodos.find((periodo) => periodo.id === dia.periodoId) ?? null;
  }

  /** Jornada vigente em cada dia do intervalo, para a tela mostrar o esperado. */
  private jornadaPorDia(
    vinculos: readonly VinculoVigenteRegistro[],
    inicio: Date,
    fim: Date,
  ): Record<string, JornadaResumoResponse> {
    const mapa: Record<string, JornadaResumoResponse> = {};

    for (const data of datasDoIntervalo(inicio, fim)) {
      const vinculo = vinculos.find(
        (item) =>
          item.inicioVigencia <= data && (item.fimVigencia === null || item.fimVigencia >= data),
      );
      if (vinculo) {
        mapa[dateParaDataIso(data)] = paraJornadaResumo(vinculo.jornada);
      }
    }

    return mapa;
  }

  private validarIntervalo(inicio: Date, fim: Date): void {
    if (fim < inicio) {
      throw new BadRequestException('O fim do intervalo nao pode ser anterior ao inicio.');
    }
    if (quantidadeDeDias(inicio, fim) > PONTO_MAXIMO_DIAS_CONSULTA) {
      throw new BadRequestException(
        `O intervalo nao pode passar de ${PONTO_MAXIMO_DIAS_CONSULTA} dias.`,
      );
    }
  }
}
