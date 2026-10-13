import { Readable } from 'node:stream';
import { BadRequestException } from '@nestjs/common';
import {
  IMPORTACAO_MARCACOES_COLUNAS,
  IMPORTACAO_MARCACOES_EXTENSOES,
  IMPORTACAO_MARCACOES_MAXIMO_LINHAS,
  IMPORTACAO_MARCACOES_TAMANHO_MAXIMO_BYTES,
} from '@sistema/shared';
import ExcelJS from 'exceljs';
import type { ArquivoEnviado } from '../../funcionarios/importacao/arquivo-enviado';

/**
 * Leitura do CSV de marcacoes (T-042 / RF-019).
 *
 * Uma linha por dia de cada funcionario:
 *
 *   matricula;data;entrada;saida_intervalo;retorno_intervalo;saida
 *
 * `cpf` serve no lugar de `matricula`, e `ocorrencia` e `observacao` sao
 * opcionais. O relogio de ponto de que a RF-019 fala - "se existir" - nao esta
 * definido no projeto; o formato aceito e o do proprio modelo de dados, para o
 * arquivo passar pelas mesmas validacoes do lancamento manual (RF-016) em vez
 * de uma segunda regra paralela.
 *
 * O arquivo e dado nao confiavel: nada dele e executado, formula entra pelo
 * resultado ja calculado e o processamento acontece inteiro em memoria, sem
 * gravar em disco. Extensao, tamanho, cabecalho e teto de linhas sao conferidos
 * antes de qualquer processamento.
 */

type Coluna = (typeof IMPORTACAO_MARCACOES_COLUNAS)[number];

/** Uma linha de dados, tudo como texto cru para o service validar. */
export interface LinhaMarcacaoCsv {
  /** Numero da linha no arquivo, contando o cabecalho como linha 1. */
  linha: number;
  matricula: string;
  cpf: string;
  data: string;
  entrada: string;
  saidaIntervalo: string;
  retornoIntervalo: string;
  saida: string;
  ocorrencia: string;
  observacao: string;
}

/** Compara cabecalhos ignorando acento, caixa e separador. */
function normalizarCabecalho(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function extensao(nome: string): string {
  const ponto = nome.lastIndexOf('.');
  return ponto < 0 ? '' : nome.slice(ponto).toLowerCase();
}

/**
 * Delimitador do arquivo, deduzido da primeira linha.
 *
 * CSV exportado no Brasil costuma vir com ponto e virgula; o padrao do exceljs
 * e a virgula. Sem essa deducao o arquivo inteiro chegaria numa unica coluna e
 * o usuario veria "cabecalho invalido" sem entender o motivo.
 */
function delimitador(buffer: Buffer): string {
  const primeiraLinha = buffer.subarray(0, 4096).toString('utf8').split(/\r?\n/)[0] ?? '';
  const pontoEVirgula = primeiraLinha.split(';').length - 1;
  const virgula = primeiraLinha.split(',').length - 1;
  const tabulacao = primeiraLinha.split('\t').length - 1;

  if (tabulacao > pontoEVirgula && tabulacao > virgula) {
    return '\t';
  }
  return pontoEVirgula > virgula ? ';' : ',';
}

/** Data de celula para "AAAA-MM-DD", sem deslocamento de fuso. */
function dataParaIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Texto de uma celula; formula entra pelo resultado, nunca pela expressao. */
function textoDaCelula(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) {
    return '';
  }
  if (typeof valor === 'string') {
    return valor.trim();
  }
  if (typeof valor === 'number') {
    return Number.isInteger(valor) ? valor.toFixed(0) : String(valor);
  }
  if (typeof valor === 'boolean') {
    return String(valor);
  }
  if (valor instanceof Date) {
    return dataParaIso(valor);
  }
  if (typeof valor === 'object') {
    const objeto = valor as unknown as Record<string, unknown>;
    if (Array.isArray(objeto['richText'])) {
      return (objeto['richText'] as { text?: string }[])
        .map((parte) => parte.text ?? '')
        .join('')
        .trim();
    }
    if ('result' in objeto) {
      return textoDaCelula(objeto['result'] as ExcelJS.CellValue);
    }
    if ('text' in objeto && typeof objeto['text'] === 'string') {
      return objeto['text'].trim();
    }
    return '';
  }
  return '';
}

export async function lerCsvMarcacoes(arquivo: ArquivoEnviado): Promise<LinhaMarcacaoCsv[]> {
  if (arquivo.size > IMPORTACAO_MARCACOES_TAMANHO_MAXIMO_BYTES) {
    throw new BadRequestException(
      `Arquivo acima do limite de ${String(
        Math.floor(IMPORTACAO_MARCACOES_TAMANHO_MAXIMO_BYTES / 1024 / 1024),
      )} MB.`,
    );
  }

  if (
    !(IMPORTACAO_MARCACOES_EXTENSOES as readonly string[]).includes(extensao(arquivo.originalname))
  ) {
    throw new BadRequestException(
      `Envie um arquivo ${IMPORTACAO_MARCACOES_EXTENSOES.join(' ou ')}.`,
    );
  }

  const planilha = new ExcelJS.Workbook();

  try {
    // `map` identidade: sem ele o exceljs converte celula a celula para numero e
    // perde o zero a esquerda de matricula e CPF.
    await planilha.csv.read(Readable.from(arquivo.buffer), {
      map: (valor: string) => valor,
      parserOptions: { delimiter: delimitador(arquivo.buffer) },
    });
  } catch {
    throw new BadRequestException('Nao foi possivel ler o arquivo. Confira o CSV enviado.');
  }

  const aba = planilha.worksheets[0];
  if (!aba) {
    throw new BadRequestException('O arquivo esta vazio.');
  }

  const posicoes = new Map<Coluna, number>();
  aba.getRow(1).eachCell({ includeEmpty: false }, (celula, coluna) => {
    const nome = normalizarCabecalho(textoDaCelula(celula.value));
    const conhecida = IMPORTACAO_MARCACOES_COLUNAS.find((item) => item === nome);
    if (conhecida && !posicoes.has(conhecida)) {
      posicoes.set(conhecida, coluna);
    }
  });

  if (!posicoes.has('data')) {
    throw new BadRequestException('Cabecalho invalido. Coluna obrigatoria ausente: data.');
  }
  if (!posicoes.has('matricula') && !posicoes.has('cpf')) {
    throw new BadRequestException(
      'Cabecalho invalido. Informe a coluna matricula ou a coluna cpf para identificar o funcionario.',
    );
  }

  // `rowCount` conta o cabecalho; o teto vale para as linhas de dados.
  if (aba.rowCount - 1 > IMPORTACAO_MARCACOES_MAXIMO_LINHAS) {
    throw new BadRequestException(
      `O arquivo tem mais de ${String(IMPORTACAO_MARCACOES_MAXIMO_LINHAS)} linhas. ` +
        'Divida a importacao em arquivos menores.',
    );
  }

  const ler = (linha: ExcelJS.Row, coluna: Coluna): string => {
    const posicao = posicoes.get(coluna);
    return posicao === undefined ? '' : textoDaCelula(linha.getCell(posicao).value);
  };

  const linhas: LinhaMarcacaoCsv[] = [];

  for (let numero = 2; numero <= aba.rowCount; numero += 1) {
    const linha = aba.getRow(numero);

    const dados: LinhaMarcacaoCsv = {
      linha: numero,
      matricula: ler(linha, 'matricula'),
      cpf: ler(linha, 'cpf'),
      data: ler(linha, 'data'),
      entrada: ler(linha, 'entrada'),
      saidaIntervalo: ler(linha, 'saidaintervalo'),
      retornoIntervalo: ler(linha, 'retornointervalo'),
      saida: ler(linha, 'saida'),
      ocorrencia: ler(linha, 'ocorrencia'),
      observacao: ler(linha, 'observacao'),
    };

    // Linha inteiramente vazia (comum no fim do arquivo) nao vira erro.
    const vazia = [
      dados.matricula,
      dados.cpf,
      dados.data,
      dados.entrada,
      dados.saidaIntervalo,
      dados.retornoIntervalo,
      dados.saida,
      dados.ocorrencia,
      dados.observacao,
    ].every((valor) => valor.length === 0);
    if (!vazia) {
      linhas.push(dados);
    }
  }

  return linhas;
}
