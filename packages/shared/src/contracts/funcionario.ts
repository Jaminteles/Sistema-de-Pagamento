import type { SituacaoFuncionario, TipoChavePix } from '../enums/cadastros.js';

/**
 * Funcionario como a API devolve (RF-006).
 *
 * `cpf` ja vem formatado e, para perfil sem permissao de ver o dado completo,
 * mascarado pelo back-end (RNF-05). O front-end apenas exibe o texto: ele nao
 * recebe os digitos e nao tem como desmascarar. `cpfMascarado` existe para a
 * tela avisar que o valor esta parcial.
 */
export interface FuncionarioResponse {
  id: string;
  nome: string;
  /** "123.456.789-01" ou "***.456.789-**" quando mascarado. */
  cpf: string;
  cpfMascarado: boolean;
  matricula: string;
  cargo: string | null;
  /** "AAAA-MM-DD". */
  admissao: string;
  /** "AAAA-MM-DD" quando desligado (RN-12). */
  desligamento: string | null;
  situacao: SituacaoFuncionario;
  /** Vinculo vigente hoje, quando existe (RF-010). */
  vinculoAtual: VinculoFuncionarioResponse | null;
  /** Verdadeiro quando ha chave Pix ou conta cadastrada (base da RN-08). */
  temDadosPagamento: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/** POST /api/funcionarios (RF-006). Funcionario novo nasce ATIVO. */
export interface CriarFuncionarioRequest {
  nome: string;
  /** Com ou sem pontuacao; a API guarda somente os digitos. */
  cpf: string;
  matricula: string;
  cargo?: string | null;
  admissao: string;
}

/**
 * PATCH /api/funcionarios/:id (RF-006).
 *
 * CPF nao e alteravel: ele identifica a pessoa no casamento da importacao de
 * liquidos (RF-027) e no historico de ponto. Corrigir CPF errado e operacao de
 * administrador, feita por cadastro novo.
 */
export interface AtualizarFuncionarioRequest {
  nome?: string;
  matricula?: string;
  cargo?: string | null;
  admissao?: string;
  /** RN-12: desligado continua visivel nos periodos anteriores. */
  desligamento?: string | null;
  situacao?: SituacaoFuncionario;
}

/** Filtros de GET /api/funcionarios. */
export interface FiltroFuncionarios {
  /** Busca por nome, matricula ou CPF (com ou sem pontuacao). */
  busca?: string;
  situacao?: SituacaoFuncionario;
  /** Restringe aos funcionarios vinculados a esta obra. */
  obraId?: string;
  /** Somente quem tem vinculo vigente hoje. */
  comVinculoVigente?: boolean;
}

/**
 * Dados de pagamento do funcionario (RF-007).
 *
 * Chave Pix e conta ficam criptografadas em repouso (RNF-04). A resposta traz o
 * valor completo somente para os perfis da matriz da secao 3 que podem ver
 * dados bancarios (Admin, RH e Financeiro); para os demais, `mascarado` e
 * verdadeiro e os campos completos vem nulos (RNF-05).
 */
export interface DadosPagamentoResponse {
  funcionarioId: string;
  tipoChave: TipoChavePix | null;
  /** Nulo quando `mascarado`. */
  chavePix: string | null;
  chavePixMascara: string | null;
  banco: string | null;
  /** Nulo quando `mascarado`. */
  agencia: string | null;
  /** Nulo quando `mascarado`. */
  conta: string | null;
  contaMascara: string | null;
  mascarado: boolean;
  /** RF-037: ultima validacao de titularidade junto ao banco. */
  validadoEm: string | null;
  atualizadoEm: string | null;
}

/**
 * PUT /api/funcionarios/:id/dados-pagamento (RF-007).
 *
 * Substitui os dados inteiros. Informe a chave Pix, ou banco/agencia/conta, ou
 * ambos. Corpo com todos os campos nulos limpa o cadastro - e o funcionario
 * deixa de entrar em lote (RN-08).
 */
export interface DefinirDadosPagamentoRequest {
  tipoChave?: TipoChavePix | null;
  chavePix?: string | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
}

/** Vinculo do funcionario a obra e jornada, com vigencia (RF-010). */
export interface VinculoFuncionarioResponse {
  id: string;
  funcionarioId: string;
  obraId: string;
  obraNome: string;
  jornadaId: string;
  jornadaNome: string;
  /** "AAAA-MM-DD". */
  inicioVigencia: string;
  /** "AAAA-MM-DD"; nulo enquanto o vinculo esta aberto. */
  fimVigencia: string | null;
  criadoEm: string;
}

/**
 * POST /api/funcionarios/:id/vinculos (RF-010).
 *
 * So existe um vinculo aberto por funcionario: abrir um novo sem informar o fim
 * do anterior e recusado. Vigencias nao podem se sobrepor.
 */
export interface CriarVinculoRequest {
  obraId: string;
  jornadaId: string;
  inicioVigencia: string;
  fimVigencia?: string | null;
}

/** PATCH /api/funcionarios/:id/vinculos/:vinculoId (RF-010). */
export interface AtualizarVinculoRequest {
  obraId?: string;
  jornadaId?: string;
  inicioVigencia?: string;
  fimVigencia?: string | null;
}

// ---------------------------------------------------------------------------
// Importacao por planilha (RF-012)
// ---------------------------------------------------------------------------

/** Problema encontrado em uma linha da planilha. */
export interface ErroImportacaoFuncionario {
  /** Linha da planilha, contando o cabecalho como linha 1. */
  linha: number;
  campo: string | null;
  mensagem: string;
}

/** O que a planilha trouxe em uma linha aceita, pronto para pre-visualizacao. */
export interface PreviaFuncionarioImportado {
  linha: number;
  nome: string;
  /** Mascarado quando o perfil nao pode ver o CPF completo (RNF-05). */
  cpf: string;
  matricula: string;
  cargo: string | null;
  admissao: string;
  /** Verdadeiro quando ja existe funcionario com este CPF ou matricula. */
  jaCadastrado: boolean;
}

/**
 * POST /api/funcionarios/importacao (e .../importacao/previa) - RF-012.
 *
 * A previa nao grava nada; a importacao grava apenas as linhas sem erro e
 * devolve o mesmo relatorio.
 */
export interface ImportarFuncionariosResponse {
  /** Verdadeiro na previa: nada foi gravado. */
  simulacao: boolean;
  totalLinhas: number;
  criados: number;
  /** Linhas validas que ja existiam e foram ignoradas. */
  ignorados: number;
  /** Linhas recusadas (soma de `erros` por linha distinta). */
  comErro: number;
  itens: PreviaFuncionarioImportado[];
  erros: ErroImportacaoFuncionario[];
}

/** Colunas aceitas no cabecalho da planilha, na ordem sugerida do modelo. */
export const IMPORTACAO_FUNCIONARIOS_COLUNAS = [
  'nome',
  'cpf',
  'matricula',
  'cargo',
  'admissao',
] as const;

/** Teto de linhas por planilha. Acima disso a API recusa o arquivo. */
export const IMPORTACAO_FUNCIONARIOS_MAXIMO_LINHAS = 2000;
/** Teto de tamanho do arquivo enviado, em bytes. */
export const IMPORTACAO_FUNCIONARIOS_TAMANHO_MAXIMO_BYTES = 2 * 1024 * 1024;
/** Extensoes aceitas no upload. */
export const IMPORTACAO_FUNCIONARIOS_EXTENSOES = ['.xlsx', '.csv'] as const;

export const FUNCIONARIO_NOME_TAMANHO_MAXIMO = 160;
export const FUNCIONARIO_MATRICULA_TAMANHO_MAXIMO = 30;
export const FUNCIONARIO_CARGO_TAMANHO_MAXIMO = 120;
