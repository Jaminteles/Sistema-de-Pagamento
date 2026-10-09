import { Readable } from 'node:stream';
import { BadRequestException } from '@nestjs/common';
import {
  IMPORTACAO_FUNCIONARIOS_COLUNAS,
  IMPORTACAO_FUNCIONARIOS_EXTENSOES,
  IMPORTACAO_FUNCIONARIOS_MAXIMO_LINHAS,
  IMPORTACAO_FUNCIONARIOS_TAMANHO_MAXIMO_BYTES,
} from '@sistema/shared';
import ExcelJS from 'exceljs';
import type { ArquivoEnviado } from './arquivo-enviado';

/** Uma linha de dados da planilha, tudo como texto cru para o service validar. */
export interface LinhaPlanilha {
  /** Numero da linha no arquivo, contando o cabecalho como linha 1. */
  linha: number;
  nome: string;
  cpf: string;
  matricula: string;
  cargo: string;
  admissao: string;
}

type Coluna = (typeof IMPORTACAO_FUNCIONARIOS_COLUNAS)[number];

/** Colunas obrigatorias no cabecalho. `cargo` e opcional. */
const COLUNAS_OBRIGATORIAS: readonly Coluna[] = ['nome', 'cpf', 'matricula', 'admissao'];

/** Compara cabecalhos ignorando acento, caixa e espaco ("Admissão" = "admissao"). */
function normalizarCabecalho(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Data de celula para "AAAA-MM-DD", sem deslocamento de fuso. */
function dataParaIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * Texto de uma celula.
 *
 * Numero vira texto sem notacao cientifica (CPF e matricula chegam como numero
 * quando a planilha nao formata a coluna como texto). Data vira "AAAA-MM-DD".
 * Formula entra pelo resultado calculado, nunca pela expressao.
 */
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
    // Celula de erro (#N/A, #REF!): tratada como vazia, o service reclama do campo.
    return '';
  }
  return '';
}

function extensao(nome: string): string {
  const ponto = nome.lastIndexOf('.');
  return ponto < 0 ? '' : nome.slice(ponto).toLowerCase();
}

/**
 * Le a planilha de funcionarios enviada (RF-012).
 *
 * Validacoes do arquivo, antes de qualquer processamento: extensao, tamanho,
 * presenca da primeira aba, cabecalho e teto de linhas. O conteudo de cada
 * linha e devolvido como texto cru - a validacao de CPF, data e duplicidade
 * acontece no service, que e quem sabe o que ja existe no banco.
 *
 * O arquivo e tratado como dado nao confiavel: nada dele e executado, nenhuma
 * formula e avaliada (so o resultado ja calculado e lido) e o processamento
 * acontece inteiro em memoria, sem gravar em disco.
 */
export async function lerPlanilhaFuncionarios(arquivo: ArquivoEnviado): Promise<LinhaPlanilha[]> {
  if (arquivo.size > IMPORTACAO_FUNCIONARIOS_TAMANHO_MAXIMO_BYTES) {
    throw new BadRequestException(
      `Arquivo acima do limite de ${String(
        Math.floor(IMPORTACAO_FUNCIONARIOS_TAMANHO_MAXIMO_BYTES / 1024 / 1024),
      )} MB.`,
    );
  }

  const tipo = extensao(arquivo.originalname);
  if (!(IMPORTACAO_FUNCIONARIOS_EXTENSOES as readonly string[]).includes(tipo)) {
    throw new BadRequestException(
      `Envie um arquivo ${IMPORTACAO_FUNCIONARIOS_EXTENSOES.join(' ou ')}.`,
    );
  }

  const planilha = new ExcelJS.Workbook();

  try {
    if (tipo === '.csv') {
      // `map` identidade: sem ele o exceljs converte celula a celula para
      // numero e perde o zero a esquerda de CPF e matricula.
      await planilha.csv.read(Readable.from(arquivo.buffer), { map: (valor: string) => valor });
    } else {
      // O exceljs declara o parametro com o Buffer de uma versao antiga de
      // @types/node; o valor em si e o mesmo Buffer.
      await planilha.xlsx.load(arquivo.buffer as unknown as Parameters<typeof planilha.xlsx.load>[0]);
    }
  } catch {
    throw new BadRequestException('Nao foi possivel ler a planilha. Confira o arquivo enviado.');
  }

  const aba = planilha.worksheets[0];
  if (!aba) {
    throw new BadRequestException('A planilha esta vazia.');
  }

  const cabecalho = aba.getRow(1);
  const posicoes = new Map<Coluna, number>();

  cabecalho.eachCell({ includeEmpty: false }, (celula, coluna) => {
    const nome = normalizarCabecalho(textoDaCelula(celula.value));
    const conhecida = IMPORTACAO_FUNCIONARIOS_COLUNAS.find((item) => item === nome);
    if (conhecida && !posicoes.has(conhecida)) {
      posicoes.set(conhecida, coluna);
    }
  });

  const faltando = COLUNAS_OBRIGATORIAS.filter((coluna) => !posicoes.has(coluna));
  if (faltando.length > 0) {
    throw new BadRequestException(
      `Cabecalho invalido. Colunas obrigatorias ausentes: ${faltando.join(', ')}.`,
    );
  }

  // `rowCount` conta o cabecalho; o teto vale para as linhas de dados.
  if (aba.rowCount - 1 > IMPORTACAO_FUNCIONARIOS_MAXIMO_LINHAS) {
    throw new BadRequestException(
      `A planilha tem mais de ${String(IMPORTACAO_FUNCIONARIOS_MAXIMO_LINHAS)} linhas. ` +
        'Divida a importacao em arquivos menores.',
    );
  }

  const ler = (linha: ExcelJS.Row, coluna: Coluna): string => {
    const posicao = posicoes.get(coluna);
    return posicao === undefined ? '' : textoDaCelula(linha.getCell(posicao).value);
  };

  const linhas: LinhaPlanilha[] = [];

  for (let numero = 2; numero <= aba.rowCount; numero += 1) {
    const linha = aba.getRow(numero);

    const dados: LinhaPlanilha = {
      linha: numero,
      nome: ler(linha, 'nome'),
      cpf: ler(linha, 'cpf'),
      matricula: ler(linha, 'matricula'),
      cargo: ler(linha, 'cargo'),
      admissao: ler(linha, 'admissao'),
    };

    // Linha inteiramente vazia (comum no fim do arquivo) nao vira erro.
    const vazia = [dados.nome, dados.cpf, dados.matricula, dados.cargo, dados.admissao].every(
      (valor) => valor.length === 0,
    );
    if (!vazia) {
      linhas.push(dados);
    }
  }

  return linhas;
}
