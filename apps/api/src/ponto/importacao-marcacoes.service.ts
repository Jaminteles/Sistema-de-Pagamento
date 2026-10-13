import { Injectable } from '@nestjs/common';
import {
  apenasDigitos,
  CPF_TAMANHO,
  dataIsoValida,
  type ErroImportacaoMarcacao,
  type ImportarMarcacoesResponse,
  OCORRENCIAS_DIA,
  OcorrenciaDia,
  OrigemMarcacao,
  PONTO_MAXIMO_ITENS_LOTE,
  type PreviaMarcacaoImportada,
  TipoMarcacao,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import { dataIsoParaDate } from '../common/data/data-iso';
import { FuncionariosRepository } from '../funcionarios/funcionarios.repository';
import { EscopoObraService } from '../obras/escopo-obra.service';
import type { ArquivoEnviado } from '../funcionarios/importacao/arquivo-enviado';
import type { LinhaMarcacaoCsv } from './importacao/arquivo-csv-marcacoes';
import { lerCsvMarcacoes } from './importacao/arquivo-csv-marcacoes';
import { type EntradaLancamento, LancamentoService } from './lancamento.service';

/** Funcionario resolvido pela matricula ou pelo CPF do arquivo. */
interface FuncionarioIdentificado {
  id: string;
  nome: string;
  matricula: string;
}

/** Linha aceita na leitura, pronta para entrar no lancamento. */
interface LinhaPreparada {
  linha: number;
  funcionario: FuncionarioIdentificado;
  data: string;
  ocorrencia: OcorrenciaDia;
  observacao: string | null;
  horarios: Partial<Record<TipoMarcacao, string | null>>;
}

/** "7:00", "07:00" e "07:00:00" chegam como "07:00"; o resto e recusado. */
function normalizarHora(valor: string): string | null {
  if (valor.trim().length === 0) {
    return null;
  }
  const casamento = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(valor.trim());
  if (!casamento) {
    return null;
  }
  const hora = Number(casamento[1]);
  if (hora > 23) {
    return null;
  }
  return `${String(hora).padStart(2, '0')}:${casamento[2] as string}`;
}

/** Aceita "AAAA-MM-DD" e "DD/MM/AAAA", os dois formatos que saem de planilha. */
function normalizarData(valor: string): string | null {
  const texto = valor.trim();

  const brasileira = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  const iso = brasileira
    ? `${brasileira[3] as string}-${brasileira[2] as string}-${brasileira[1] as string}`
    : texto;

  return dataIsoValida(iso) ? iso : null;
}

/**
 * Importacao de marcacoes por CSV (T-042 / RF-019).
 *
 * O arquivo e traduzido em dias de lancamento e entregue ao mesmo
 * LancamentoService da grade: periodo aberto (RN-07), envio ao RH (RN-06),
 * escopo do encarregado (RN-05), vinculo na data, ocorrencia (RF-015) e
 * validacao das marcacoes (RF-016) valem igual para arquivo e para digitacao.
 * Importar nunca deve ser um caminho mais permissivo que a tela.
 *
 * A diferenca e a origem gravada: marcacao vinda de arquivo fica como
 * IMPORTADO, e nao MANUAL, para o espelho de ponto e a conferencia do RH
 * distinguirem uma da outra.
 *
 * Perfis: ADMIN e RH. O encarregado lanca pela grade da equipe dele; um arquivo
 * com a empresa inteira e operacao de RH.
 */
@Injectable()
export class ImportacaoMarcacoesService {
  constructor(
    private readonly lancamento: LancamentoService,
    private readonly funcionarios: FuncionariosRepository,
    private readonly escopoObra: EscopoObraService,
  ) {}

  async importar(
    arquivo: ArquivoEnviado,
    usuario: UsuarioRequisicao,
  ): Promise<ImportarMarcacoesResponse> {
    const linhas = await lerCsvMarcacoes(arquivo);
    const erros: ErroImportacaoMarcacao[] = [];

    const identificados = await this.identificar(linhas);
    const preparadas = this.preparar(linhas, identificados, erros);

    const escopo = {
      obrasPermitidas: await this.escopoObra.obrasPermitidas(usuario),
      origem: OrigemMarcacao.IMPORTADO,
    };

    const porChave = new Map(
      preparadas.map((item) => [`${item.funcionario.id}|${item.data}`, item]),
    );
    const recusadas = new Set<string>();
    let gravados = 0;

    // Em lotes do mesmo tamanho que a grade aceita: um arquivo de 5000 linhas
    // nao deve virar uma transacao unica de 5000 upserts.
    for (const lote of this.emLotes(preparadas, PONTO_MAXIMO_ITENS_LOTE)) {
      const resultado = await this.lancamento.aplicar(
        usuario,
        lote.map((item) => this.paraEntrada(item)),
        escopo,
      );

      gravados += resultado.salvos;

      // O lancamento recusa por funcionario e data; aqui a recusa volta para a
      // linha do arquivo, que e o que o usuario consegue corrigir.
      for (const erro of resultado.erros) {
        const chave = `${erro.funcionarioId}|${erro.data}`;
        recusadas.add(chave);
        erros.push({
          linha: porChave.get(chave)?.linha ?? 0,
          campo: erro.campo,
          mensagem: erro.motivo,
        });
      }
    }

    const gravadas = preparadas.filter(
      (item) => !recusadas.has(`${item.funcionario.id}|${item.data}`),
    );

    return {
      totalLinhas: linhas.length,
      gravados,
      comErro: new Set(erros.map((erro) => erro.linha)).size,
      itens: gravadas.map((item) => this.paraPrevia(item)),
      erros,
    };
  }

  private emLotes(itens: readonly LinhaPreparada[], tamanho: number): LinhaPreparada[][] {
    const lotes: LinhaPreparada[][] = [];
    for (let inicio = 0; inicio < itens.length; inicio += tamanho) {
      lotes.push(itens.slice(inicio, inicio + tamanho));
    }
    return lotes;
  }

  /** Resolve matricula e CPF do arquivo em uma consulta so (evita N+1). */
  private async identificar(linhas: readonly LinhaMarcacaoCsv[]): Promise<{
    porMatricula: Map<string, FuncionarioIdentificado>;
    porCpf: Map<string, FuncionarioIdentificado>;
  }> {
    const matriculas = [
      ...new Set(linhas.map((linha) => linha.matricula.trim()).filter((valor) => valor.length > 0)),
    ];
    const cpfs = [
      ...new Set(
        linhas
          .map((linha) => apenasDigitos(linha.cpf))
          .filter((valor) => valor.length === CPF_TAMANHO),
      ),
    ];

    const achados = await this.funcionarios.identificar(cpfs, matriculas);

    const porMatricula = new Map<string, FuncionarioIdentificado>();
    const porCpf = new Map<string, FuncionarioIdentificado>();

    for (const achado of achados) {
      const identificado: FuncionarioIdentificado = {
        id: achado.id,
        nome: achado.nome,
        matricula: achado.matricula,
      };
      porMatricula.set(achado.matricula, identificado);
      porCpf.set(achado.cpf, identificado);
    }

    return { porMatricula, porCpf };
  }

  /**
   * Valida o que e do arquivo - identificacao, data, formato de hora,
   * ocorrencia e linha repetida - e deixa as regras de ponto para o
   * lancamento.
   */
  private preparar(
    linhas: readonly LinhaMarcacaoCsv[],
    identificados: {
      porMatricula: Map<string, FuncionarioIdentificado>;
      porCpf: Map<string, FuncionarioIdentificado>;
    },
    erros: ErroImportacaoMarcacao[],
  ): LinhaPreparada[] {
    const preparadas: LinhaPreparada[] = [];
    const vistas = new Set<string>();

    for (const linha of linhas) {
      const registrar = (campo: string | null, mensagem: string): void => {
        erros.push({ linha: linha.linha, campo, mensagem });
      };

      const matricula = linha.matricula.trim();
      const cpf = apenasDigitos(linha.cpf);
      const funcionario =
        (matricula.length > 0 ? identificados.porMatricula.get(matricula) : undefined) ??
        (cpf.length === CPF_TAMANHO ? identificados.porCpf.get(cpf) : undefined);

      if (!funcionario) {
        // Sem ecoar matricula nem CPF: a linha basta para o usuario localizar.
        registrar(
          matricula.length > 0 ? 'matricula' : 'cpf',
          'Funcionario nao encontrado pela matricula ou pelo CPF informados.',
        );
        continue;
      }

      const data = normalizarData(linha.data);
      if (data === null) {
        registrar('data', 'Informe a data em AAAA-MM-DD ou DD/MM/AAAA.');
        continue;
      }

      const chave = `${funcionario.id}|${data}`;
      if (vistas.has(chave)) {
        registrar('data', 'O arquivo tem mais de uma linha para este funcionario nesta data.');
        continue;
      }

      const ocorrencia = this.lerOcorrencia(linha.ocorrencia);
      if (ocorrencia === null) {
        registrar('ocorrencia', `Ocorrencia invalida. Use uma de: ${OCORRENCIAS_DIA.join(', ')}.`);
        continue;
      }

      const horarios = this.lerHorarios(linha, registrar);
      if (horarios === null) {
        continue;
      }

      vistas.add(chave);
      preparadas.push({
        linha: linha.linha,
        funcionario,
        data,
        ocorrencia,
        observacao: linha.observacao.trim().length === 0 ? null : linha.observacao.trim(),
        horarios,
      });
    }

    return preparadas;
  }

  private lerOcorrencia(valor: string): OcorrenciaDia | null {
    const texto = valor.trim().toUpperCase().replace(/\s+/g, '_');
    if (texto.length === 0) {
      return OcorrenciaDia.NORMAL;
    }
    return (OCORRENCIAS_DIA as readonly string[]).includes(texto) ? (texto as OcorrenciaDia) : null;
  }

  /**
   * Horarios da linha.
   *
   * Celula vazia vira `null`, que apaga a marcacao: o arquivo representa o dia
   * inteiro, e manter uma batida antiga que o arquivo nao traz deixaria o dia
   * meio importado, meio digitado.
   */
  private lerHorarios(
    linha: LinhaMarcacaoCsv,
    registrar: (campo: string | null, mensagem: string) => void,
  ): Partial<Record<TipoMarcacao, string | null>> | null {
    const campos: { coluna: string; tipo: TipoMarcacao; valor: string }[] = [
      { coluna: 'entrada', tipo: TipoMarcacao.ENTRADA, valor: linha.entrada },
      {
        coluna: 'saida_intervalo',
        tipo: TipoMarcacao.SAIDA_INTERVALO,
        valor: linha.saidaIntervalo,
      },
      {
        coluna: 'retorno_intervalo',
        tipo: TipoMarcacao.RETORNO_INTERVALO,
        valor: linha.retornoIntervalo,
      },
      { coluna: 'saida', tipo: TipoMarcacao.SAIDA, valor: linha.saida },
    ];

    const horarios: Partial<Record<TipoMarcacao, string | null>> = {};

    for (const campo of campos) {
      if (campo.valor.trim().length === 0) {
        horarios[campo.tipo] = null;
        continue;
      }
      const hora = normalizarHora(campo.valor);
      if (hora === null) {
        registrar(campo.coluna, 'Informe o horario em HH:MM.');
        return null;
      }
      horarios[campo.tipo] = hora;
    }

    return horarios;
  }

  private paraEntrada(item: LinhaPreparada): EntradaLancamento {
    return {
      funcionarioId: item.funcionario.id,
      data: dataIsoParaDate(item.data),
      ocorrencia: item.ocorrencia,
      observacao: item.observacao,
      horarios: item.horarios,
    };
  }

  private paraPrevia(item: LinhaPreparada): PreviaMarcacaoImportada {
    return {
      linha: item.linha,
      funcionarioId: item.funcionario.id,
      funcionarioNome: item.funcionario.nome,
      matricula: item.funcionario.matricula,
      data: item.data,
      entrada: item.horarios[TipoMarcacao.ENTRADA] ?? null,
      saidaIntervalo: item.horarios[TipoMarcacao.SAIDA_INTERVALO] ?? null,
      retornoIntervalo: item.horarios[TipoMarcacao.RETORNO_INTERVALO] ?? null,
      saida: item.horarios[TipoMarcacao.SAIDA] ?? null,
      ocorrencia: item.ocorrencia,
    };
  }
}
