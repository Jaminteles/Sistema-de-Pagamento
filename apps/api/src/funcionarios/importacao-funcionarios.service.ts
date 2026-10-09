import { Injectable } from '@nestjs/common';
import {
  apenasDigitos,
  cpfValido,
  CPF_TAMANHO,
  dataIsoValida,
  type ErroImportacaoFuncionario,
  formatarCpf,
  FUNCIONARIO_CARGO_TAMANHO_MAXIMO,
  FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO,
  FUNCIONARIO_NOME_TAMANHO_MAXIMO,
  type ImportarFuncionariosResponse,
  mascararCpf,
  type PreviaFuncionarioImportado,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import { dataIsoParaDate } from '../common/data/data-iso';
import { podeVerDadoCompleto } from './funcionario.resposta';
import { type DadosFuncionario, FuncionariosRepository } from './funcionarios.repository';
import type { ArquivoEnviado } from './importacao/arquivo-enviado';
import { lerPlanilhaFuncionarios, type LinhaPlanilha } from './importacao/planilha-funcionarios';

/** Linha que passou pela validacao de formato, pronta para checar duplicidade. */
interface LinhaAceita {
  linha: number;
  nome: string;
  cpf: string;
  matricula: string;
  cargo: string | null;
  admissao: string;
}

/**
 * Converte a data da planilha para "AAAA-MM-DD".
 *
 * Aceita o formato ISO e o brasileiro "DD/MM/AAAA", que e o que sai do Excel em
 * portugues quando a coluna esta formatada como texto. Devolve null quando nao
 * reconhece ou quando o dia nao existe no calendario.
 */
function normalizarAdmissao(valor: string): string | null {
  const limpo = valor.trim();

  const brasileiro = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(limpo);
  const iso = brasileiro
    ? `${brasileiro[3] as string}-${brasileiro[2] as string}-${brasileiro[1] as string}`
    : limpo;

  return dataIsoValida(iso) ? iso : null;
}

/**
 * Importacao de funcionarios por planilha (RF-012).
 *
 * Duas entradas com o mesmo codigo: a previa nao grava nada e serve a
 * pre-visualizacao da tela (T-030); a importacao grava as linhas aceitas em uma
 * transacao - ou vale inteira, ou nada e gravado.
 *
 * O relatorio aponta a linha, o campo e o motivo de cada recusa, para o RH
 * corrigir a planilha em vez de adivinhar. CPF no relatorio segue a mesma
 * mascara por perfil do resto da API (RNF-05).
 *
 * O arquivo e dado nao confiavel: nada dele e executado, nada e gravado em
 * disco e os tetos de tamanho e de linhas sao verificados antes de processar.
 */
@Injectable()
export class ImportacaoFuncionariosService {
  constructor(private readonly repositorio: FuncionariosRepository) {}

  async importar(
    arquivo: ArquivoEnviado,
    usuario: UsuarioRequisicao,
    simulacao: boolean,
  ): Promise<ImportarFuncionariosResponse> {
    const linhas = await lerPlanilhaFuncionarios(arquivo);

    const erros: ErroImportacaoFuncionario[] = [];
    const aceitas: LinhaAceita[] = [];
    const cpfsVistos = new Map<string, number>();
    const matriculasVistas = new Map<string, number>();

    for (const linha of linhas) {
      const aceita = this.validarLinha(linha, erros);
      if (!aceita) {
        continue;
      }

      const cpfRepetido = cpfsVistos.get(aceita.cpf);
      if (cpfRepetido !== undefined) {
        erros.push({
          linha: aceita.linha,
          campo: 'cpf',
          mensagem: `CPF repetido na planilha (ja aparece na linha ${String(cpfRepetido)}).`,
        });
        continue;
      }

      const matriculaRepetida = matriculasVistas.get(aceita.matricula.toLowerCase());
      if (matriculaRepetida !== undefined) {
        erros.push({
          linha: aceita.linha,
          campo: 'matricula',
          mensagem: `Matricula repetida na planilha (ja aparece na linha ${String(matriculaRepetida)}).`,
        });
        continue;
      }

      cpfsVistos.set(aceita.cpf, aceita.linha);
      matriculasVistas.set(aceita.matricula.toLowerCase(), aceita.linha);
      aceitas.push(aceita);
    }

    const existentes = await this.repositorio.existentes(
      aceitas.map((item) => item.cpf),
      aceitas.map((item) => item.matricula),
    );

    const completo = podeVerDadoCompleto(usuario);
    const itens: PreviaFuncionarioImportado[] = [];
    const novos: DadosFuncionario[] = [];

    for (const aceita of aceitas) {
      const jaCadastrado =
        existentes.cpfs.has(aceita.cpf) || existentes.matriculas.has(aceita.matricula);

      itens.push({
        linha: aceita.linha,
        nome: aceita.nome,
        cpf: completo ? formatarCpf(aceita.cpf) : mascararCpf(aceita.cpf),
        matricula: aceita.matricula,
        cargo: aceita.cargo,
        admissao: aceita.admissao,
        jaCadastrado,
      });

      if (!jaCadastrado) {
        novos.push({
          nome: aceita.nome,
          cpf: aceita.cpf,
          matricula: aceita.matricula,
          cargo: aceita.cargo,
          admissao: dataIsoParaDate(aceita.admissao),
        });
      }
    }

    const criados = simulacao ? 0 : await this.repositorio.criarMuitos(novos);

    return {
      simulacao,
      totalLinhas: linhas.length,
      criados: simulacao ? novos.length : criados,
      ignorados: aceitas.length - novos.length,
      comErro: new Set(erros.map((erro) => erro.linha)).size,
      itens,
      erros,
    };
  }

  /**
   * Valida o formato de uma linha. Acumula todos os problemas da linha, para o
   * RH corrigir tudo de uma vez em vez de reenviar a planilha a cada erro.
   */
  private validarLinha(
    linha: LinhaPlanilha,
    erros: ErroImportacaoFuncionario[],
  ): LinhaAceita | null {
    const inicio = erros.length;
    const nome = linha.nome.trim();

    if (nome.length < 3) {
      erros.push({ linha: linha.linha, campo: 'nome', mensagem: 'Informe o nome completo.' });
    } else if (nome.length > FUNCIONARIO_NOME_TAMANHO_MAXIMO) {
      erros.push({
        linha: linha.linha,
        campo: 'nome',
        mensagem: `Nome acima de ${String(FUNCIONARIO_NOME_TAMANHO_MAXIMO)} caracteres.`,
      });
    }

    // A planilha costuma perder o zero a esquerda quando a coluna e numerica.
    const digitos = apenasDigitos(linha.cpf);
    const cpf = digitos.length > 0 && digitos.length < CPF_TAMANHO
      ? digitos.padStart(CPF_TAMANHO, '0')
      : digitos;

    if (!cpfValido(cpf)) {
      erros.push({ linha: linha.linha, campo: 'cpf', mensagem: 'CPF invalido.' });
    }

    const matricula = linha.matricula.trim();
    if (matricula.length === 0) {
      erros.push({ linha: linha.linha, campo: 'matricula', mensagem: 'Informe a matricula.' });
    } else if (matricula.length > FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO) {
      erros.push({
        linha: linha.linha,
        campo: 'matricula',
        mensagem: `Matricula acima de ${String(FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO)} caracteres.`,
      });
    }

    const cargoBruto = linha.cargo.trim();
    if (cargoBruto.length > FUNCIONARIO_CARGO_TAMANHO_MAXIMO) {
      erros.push({
        linha: linha.linha,
        campo: 'cargo',
        mensagem: `Cargo acima de ${String(FUNCIONARIO_CARGO_TAMANHO_MAXIMO)} caracteres.`,
      });
    }

    const admissao = normalizarAdmissao(linha.admissao);
    if (admissao === null) {
      erros.push({
        linha: linha.linha,
        campo: 'admissao',
        mensagem: 'Informe a admissao em AAAA-MM-DD ou DD/MM/AAAA.',
      });
    }

    if (erros.length > inicio || admissao === null) {
      return null;
    }

    return {
      linha: linha.linha,
      nome,
      cpf,
      matricula,
      cargo: cargoBruto.length === 0 ? null : cargoBruto,
      admissao,
    };
  }
}
