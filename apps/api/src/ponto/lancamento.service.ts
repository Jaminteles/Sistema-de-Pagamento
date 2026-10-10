import { Injectable } from '@nestjs/common';
import {
  aceitaMarcacao,
  type CampoLancamento,
  type ErroLancamentoResponse,
  horaParaMinutos,
  type LancarPontoResponse,
  MINUTOS_NO_DIA,
  OcorrenciaDia,
  OCORRENCIA_DIA_LABEL,
  ORDEM_MARCACAO,
  type TipoMarcacao,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import { adicionarDias, dateParaDataIso } from '../common/data/data-iso';
import { horaLocalParaInstante } from '../common/data/fuso-negocio';
import { bloqueioDeEscrita, paraDiaResponse, podeEscrever } from './ponto.resposta';
import {
  type DiaPontoRegistro,
  type LancamentoGravavel,
  type PeriodoRegistro,
  PontoRepository,
  type VinculoVigenteRegistro,
} from './ponto.repository';
import {
  type MarcacaoResolvida,
  type MarcacoesDigitadas,
  validarMarcacoes,
  validarSobreposicao,
} from './validacao-marcacoes';

/**
 * Um dia a lancar, como chega da grade de equipe (RF-013) ou da tela por
 * funcionario (RF-014).
 *
 * Horario em "HH:MM": ausente mantem o que esta gravado, `null` apaga a
 * marcacao. Assim a grade envia so o que o encarregado digitou.
 */
export interface EntradaLancamento {
  funcionarioId: string;
  data: Date;
  ocorrencia?: OcorrenciaDia;
  observacao?: string | null;
  horarios: Partial<Record<TipoMarcacao, string | null>>;
}

/** Escopo da operacao: `null` em obrasPermitidas significa sem restricao. */
export interface EscopoLancamento {
  obrasPermitidas: readonly string[] | null;
}

interface Preparado {
  entrada: EntradaLancamento;
  dataIso: string;
  periodo: PeriodoRegistro;
  diaAtual: DiaPontoRegistro | null;
  ocorrencia: OcorrenciaDia;
  observacao: string | null;
  resolvidas: MarcacaoResolvida[];
  remover: TipoMarcacao[];
}

/** Intervalo ocupado por um dia de ponto, em instante absoluto. */
interface Ocupacao {
  dataIso: string;
  inicio: number;
  fim: number;
}

function chave(funcionarioId: string, dataIso: string): string {
  return `${funcionarioId}|${dataIso}`;
}

/**
 * Lancamento de ponto (T-032 a T-035 / RF-013 a RF-016).
 *
 * Caminho unico para a grade por equipe e para a tela por funcionario: as duas
 * precisam das mesmas regras (periodo aberto, escopo do encarregado, ocorrencia
 * do dia, validacao das marcacoes), e duplicar isso seria convidar as duas a
 * divergir.
 *
 * Linha com erro nao e gravada e volta em `erros`; as demais vao numa unica
 * transacao, pelo mesmo criterio da importacao de funcionarios (RF-012): uma
 * digitacao errada no meio de uma equipe de 30 pessoas nao descarta o resto do
 * trabalho.
 */
@Injectable()
export class LancamentoService {
  constructor(private readonly repositorio: PontoRepository) {}

  async aplicar(
    usuario: UsuarioRequisicao,
    entradas: readonly EntradaLancamento[],
    escopo: EscopoLancamento,
  ): Promise<LancarPontoResponse> {
    if (entradas.length === 0) {
      return { salvos: 0, dias: [], erros: [] };
    }

    const datas = entradas.map((entrada) => entrada.data.getTime());
    const inicio = new Date(Math.min(...datas));
    const fim = new Date(Math.max(...datas));
    const funcionariosIds = [...new Set(entradas.map((entrada) => entrada.funcionarioId))];

    // Um dia de margem em cada ponta: a sobreposicao do turno da noite precisa
    // ver o dia anterior e o seguinte (RF-016).
    const [periodos, vinculos, diasExistentes] = await Promise.all([
      this.repositorio.periodosNoIntervalo(inicio, fim),
      this.carregarVinculos(inicio, fim, funcionariosIds, escopo),
      this.repositorio.dias(funcionariosIds, adicionarDias(inicio, -1), adicionarDias(fim, 1)),
    ]);

    const porDia = new Map(
      diasExistentes.map((dia) => [chave(dia.funcionarioId, dateParaDataIso(dia.data)), dia]),
    );

    const erros: ErroLancamentoResponse[] = [];
    const preparados: Preparado[] = [];

    for (const entrada of entradas) {
      const dataIso = dateParaDataIso(entrada.data);
      const preparado = this.preparar(
        usuario,
        entrada,
        dataIso,
        periodos,
        vinculos,
        porDia.get(chave(entrada.funcionarioId, dataIso)) ?? null,
        erros,
      );
      if (preparado) {
        preparados.push(preparado);
      }
    }

    const aceitos = this.filtrarSobreposicoes(preparados, diasExistentes, erros);

    const salvos = await this.repositorio.salvar(aceitos.map((item) => this.paraGravavel(item)));

    const dias = salvos.map((dia) =>
      paraDiaResponse(
        dia,
        podeEscrever(
          usuario,
          periodos.find((periodo) => periodo.id === dia.periodoId) ?? null,
          dia,
        ),
      ),
    );

    return { salvos: dias.length, dias, erros };
  }

  /**
   * Vinculos dos funcionarios no intervalo, ja recortados pelo escopo do
   * encarregado (RN-05).
   *
   * O recorte entra na consulta: funcionario de obra que nao e do encarregado
   * simplesmente nao volta, e por isso o lancamento dele cai como "sem vinculo"
   * em vez de ser gravado. O id vem da rota ou do corpo, mas a lista de obras
   * vem sempre do usuario autenticado.
   */
  private async carregarVinculos(
    inicio: Date,
    fim: Date,
    funcionariosIds: readonly string[],
    escopo: EscopoLancamento,
  ): Promise<VinculoVigenteRegistro[]> {
    if (escopo.obrasPermitidas !== null && escopo.obrasPermitidas.length === 0) {
      return [];
    }

    const todos = await this.repositorio.vinculosNoIntervalo(inicio, fim, {
      ...(escopo.obrasPermitidas === null ? {} : { obrasPermitidas: escopo.obrasPermitidas }),
    });

    const pedidos = new Set(funcionariosIds);
    return todos.filter((vinculo) => pedidos.has(vinculo.funcionarioId));
  }

  /** Vinculo vigente na data, quando existe. */
  private vinculoNaData(
    vinculos: readonly VinculoVigenteRegistro[],
    funcionarioId: string,
    data: Date,
  ): VinculoVigenteRegistro | null {
    return (
      vinculos.find(
        (vinculo) =>
          vinculo.funcionarioId === funcionarioId &&
          vinculo.inicioVigencia <= data &&
          (vinculo.fimVigencia === null || vinculo.fimVigencia >= data),
      ) ?? null
    );
  }

  /**
   * Valida o dia e monta o que sera gravado, ou acrescenta o erro em `erros`.
   *
   * A ordem das recusas importa: primeiro o que e bloqueio de processo (periodo
   * fechado, periodo ja enviado ao RH), depois o cadastro (vinculo, admissao,
   * desligamento), e so no fim a digitacao das marcacoes.
   */
  private preparar(
    usuario: UsuarioRequisicao,
    entrada: EntradaLancamento,
    dataIso: string,
    periodos: readonly PeriodoRegistro[],
    vinculos: readonly VinculoVigenteRegistro[],
    diaAtual: DiaPontoRegistro | null,
    erros: ErroLancamentoResponse[],
  ): Preparado | null {
    const registrar = (campo: CampoLancamento, motivo: string): null => {
      erros.push({ funcionarioId: entrada.funcionarioId, data: dataIso, campo, motivo });
      return null;
    };

    const periodo =
      periodos.find((item) => item.dataInicio <= entrada.data && item.dataFim >= entrada.data) ??
      null;

    const bloqueio = bloqueioDeEscrita(usuario, periodo, diaAtual);
    if (bloqueio || periodo === null) {
      return registrar('DIA', bloqueio?.motivo ?? 'Periodo de apuracao inexistente para a data.');
    }

    const vinculo = this.vinculoNaData(vinculos, entrada.funcionarioId, entrada.data);
    if (!vinculo) {
      // Cobre tambem o funcionario fora do escopo do encarregado (RN-05): o
      // vinculo dele nao entrou na consulta.
      return registrar('DIA', 'Funcionario sem vinculo com obra e jornada nesta data.');
    }
    if (entrada.data < vinculo.admissao) {
      return registrar('DIA', 'Data anterior a admissao do funcionario.');
    }
    if (vinculo.desligamento !== null && entrada.data > vinculo.desligamento) {
      // RN-12: desligado continua visivel nos periodos anteriores, mas nao
      // recebe lancamento novo.
      return registrar('DIA', 'Funcionario desligado nao recebe lancamento nesta data.');
    }

    const ocorrencia = entrada.ocorrencia ?? diaAtual?.ocorrencia ?? OcorrenciaDia.NORMAL;

    const digitadas = this.mesclarMarcacoes(entrada, diaAtual);
    if (digitadas === null) {
      return registrar('OCORRENCIA', 'Informe o horario em HH:MM.');
    }

    if (!aceitaMarcacao(ocorrencia)) {
      // Ocorrencia sem trabalho nao convive com horario: se o usuario mandou os
      // dois, ele precisa escolher. Horario que ja estava gravado e apagado.
      const informouHorario = ORDEM_MARCACAO.some(
        (tipo) => typeof entrada.horarios[tipo] === 'string',
      );
      if (informouHorario) {
        return registrar(
          'OCORRENCIA',
          `A ocorrencia ${OCORRENCIA_DIA_LABEL[ocorrencia]} nao aceita marcacao de horario.`,
        );
      }
      return {
        entrada,
        dataIso,
        periodo,
        diaAtual,
        ocorrencia,
        observacao: this.observacaoFinal(entrada, diaAtual),
        resolvidas: [],
        remover: [...ORDEM_MARCACAO],
      };
    }

    const validacao = validarMarcacoes(digitadas.valores, {
      // Zero quando a jornada nao preve intervalo: cobrar minimo de quem nao
      // tem intervalo cadastrado recusaria lancamento valido.
      intervaloMinimoMinutos: Math.max(0, vinculo.jornada.intervaloMinutos),
    });

    if (!validacao.valido) {
      for (const erro of validacao.erros) {
        erros.push({
          funcionarioId: entrada.funcionarioId,
          data: dataIso,
          campo: erro.campo,
          motivo: erro.motivo,
        });
      }
      return null;
    }

    const presentes = new Set(validacao.marcacoes.map((item) => item.tipo));

    return {
      entrada,
      dataIso,
      periodo,
      diaAtual,
      ocorrencia,
      observacao: this.observacaoFinal(entrada, diaAtual),
      resolvidas: validacao.marcacoes,
      remover: ORDEM_MARCACAO.filter((tipo) => !presentes.has(tipo)),
    };
  }

  /**
   * Combina o que foi digitado com o que esta gravado.
   *
   * Devolve `null` quando algum horario veio fora de "HH:MM" - o DTO ja barra
   * isso, e esta checagem existe para o service nao confiar no formato.
   */
  private mesclarMarcacoes(
    entrada: EntradaLancamento,
    diaAtual: DiaPontoRegistro | null,
  ): { valores: MarcacoesDigitadas } | null {
    const valores: MarcacoesDigitadas = {};

    for (const tipo of ORDEM_MARCACAO) {
      const informado = entrada.horarios[tipo];

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
        valores[tipo] = this.minutosNoDia(gravada.horario, diaAtual as DiaPontoRegistro);
      }
    }

    return { valores };
  }

  /** Minutos de parede da marcacao, de 0 a 1439, como o usuario a enxerga. */
  private minutosNoDia(horario: Date, dia: DiaPontoRegistro): number {
    const meiaNoite = horaLocalParaInstante(dateParaDataIso(dia.data), 0).getTime();
    const diferenca = Math.round((horario.getTime() - meiaNoite) / 60_000);
    return ((diferenca % MINUTOS_NO_DIA) + MINUTOS_NO_DIA) % MINUTOS_NO_DIA;
  }

  private observacaoFinal(
    entrada: EntradaLancamento,
    diaAtual: DiaPontoRegistro | null,
  ): string | null {
    if (entrada.observacao === undefined) {
      return diaAtual?.observacao ?? null;
    }
    const limpo = (entrada.observacao ?? '').trim();
    return limpo.length === 0 ? null : limpo;
  }

  /**
   * Segunda passagem: recusa o dia que invade o dia vizinho (RF-016).
   *
   * Roda depois de todos os dias estarem resolvidos para que o lote enxergue o
   * estado final: corrigir segunda e terca na mesma chamada nao deve acusar
   * conflito com o valor antigo da terca.
   */
  private filtrarSobreposicoes(
    preparados: readonly Preparado[],
    diasExistentes: readonly DiaPontoRegistro[],
    erros: ErroLancamentoResponse[],
  ): Preparado[] {
    const ocupacoes = new Map<string, Ocupacao>();

    for (const dia of diasExistentes) {
      const ocupacao = this.ocupacaoGravada(dia);
      if (ocupacao) {
        ocupacoes.set(chave(dia.funcionarioId, ocupacao.dataIso), ocupacao);
      }
    }

    for (const preparado of preparados) {
      const alvo = chave(preparado.entrada.funcionarioId, preparado.dataIso);
      const ocupacao = this.ocupacaoPreparada(preparado);
      if (ocupacao) {
        ocupacoes.set(alvo, ocupacao);
      } else {
        ocupacoes.delete(alvo);
      }
    }

    const aceitos: Preparado[] = [];

    for (const preparado of preparados) {
      if (preparado.resolvidas.length === 0) {
        aceitos.push(preparado);
        continue;
      }

      const meiaNoite = horaLocalParaInstante(preparado.dataIso, 0).getTime();
      const vizinhas = [-1, 1]
        .map((deslocamento) => dateParaDataIso(adicionarDias(preparado.entrada.data, deslocamento)))
        .map((dataIso) => ocupacoes.get(chave(preparado.entrada.funcionarioId, dataIso)))
        .filter((item): item is Ocupacao => item !== undefined)
        .map((item) => ({
          data: item.dataIso,
          inicio: Math.round((item.inicio - meiaNoite) / 60_000),
          fim: Math.round((item.fim - meiaNoite) / 60_000),
        }));

      const conflitos = validarSobreposicao(preparado.resolvidas, vizinhas);
      if (conflitos.length > 0) {
        for (const conflito of conflitos) {
          erros.push({
            funcionarioId: preparado.entrada.funcionarioId,
            data: preparado.dataIso,
            campo: conflito.campo,
            motivo: conflito.motivo,
          });
        }
        continue;
      }

      aceitos.push(preparado);
    }

    return aceitos;
  }

  private ocupacaoGravada(dia: DiaPontoRegistro): Ocupacao | null {
    if (dia.marcacoes.length === 0) {
      return null;
    }
    const instantes = dia.marcacoes.map((item) => item.horario.getTime());
    return {
      dataIso: dateParaDataIso(dia.data),
      inicio: Math.min(...instantes),
      fim: Math.max(...instantes),
    };
  }

  private ocupacaoPreparada(preparado: Preparado): Ocupacao | null {
    if (preparado.resolvidas.length === 0) {
      return null;
    }
    const instantes = preparado.resolvidas.map((item) =>
      horaLocalParaInstante(preparado.dataIso, item.absoluto).getTime(),
    );
    return {
      dataIso: preparado.dataIso,
      inicio: Math.min(...instantes),
      fim: Math.max(...instantes),
    };
  }

  private paraGravavel(preparado: Preparado): LancamentoGravavel {
    return {
      periodoId: preparado.periodo.id,
      funcionarioId: preparado.entrada.funcionarioId,
      data: preparado.entrada.data,
      ocorrencia: preparado.ocorrencia,
      observacao: preparado.observacao,
      marcacoes: preparado.resolvidas.map((marcacao) => ({
        tipo: marcacao.tipo,
        horario: horaLocalParaInstante(preparado.dataIso, marcacao.absoluto),
      })),
      remover: preparado.remover,
    };
  }
}
