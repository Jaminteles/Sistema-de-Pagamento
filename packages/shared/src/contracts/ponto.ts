import type {
  CampoAjuste,
  OcorrenciaDia,
  OrigemMarcacao,
  StatusEnvioDia,
  StatusPeriodo,
  TipoMarcacao,
} from '../enums/ponto.js';

/**
 * Contratos do lancamento de ponto (M3, sprint 5).
 *
 * Convencoes que valem para todo este arquivo:
 *   - data e sempre "AAAA-MM-DD" e competencia sempre "AAAA-MM";
 *   - horario de marcacao vai e volta em "HH:MM" no fuso de negocio
 *     America/Bahia (RNF-12); o instante absoluto acompanha em `horario`;
 *   - duracao e sempre minuto inteiro, nunca float nem "7,5";
 *   - nenhum total deste contrato e calculado pelo front-end: o motor de
 *     apuracao (RF-020, sprint 6) e a unica fonte dos minutos.
 */

/** Limite de itens por chamada de lancamento em lote (RF-013). */
export const PONTO_MAXIMO_ITENS_LOTE = 200;

/** Limite de dias por chamada de lancamento por funcionario (RF-014). */
export const PONTO_MAXIMO_DIAS_LANCAMENTO = 45;

/** Limite de dias que a visao por funcionario pode pedir de uma vez. */
export const PONTO_MAXIMO_DIAS_CONSULTA = 62;

/**
 * Janela maxima entre a primeira e a ultima marcacao do dia.
 *
 * Serve de limite para a virada de meia-noite do turno da noite: dentro dela a
 * marcacao menor que a anterior cai no dia seguinte; acima dela as marcacoes
 * estao fora de ordem cronologica (RF-016).
 */
export const PONTO_JANELA_MAXIMA_MINUTOS = 18 * 60;

/** RN-01: periodo mensal. */
export interface PeriodoResponse {
  id: string;
  /** "AAAA-MM". */
  competencia: string;
  /** "AAAA-MM-DD". */
  dataInicio: string;
  /** "AAAA-MM-DD". */
  dataFim: string;
  status: StatusPeriodo;
  fechadoEm: string | null;
  reabertoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** POST /api/ponto/periodos (RF-013). O periodo nasce ABERTO. */
export interface AbrirPeriodoRequest {
  /** "AAAA-MM". Inicio e fim saem do mes cheio (RN-01). */
  competencia: string;
}

/** Resultado da abertura e da regeracao de dias do periodo (T-031). */
export interface GerarDiasResponse {
  periodo: PeriodoResponse;
  /** Funcionarios com vinculo vigente em algum dia do periodo. */
  funcionarios: number;
  /** Dias criados agora; dia que ja existia nao e tocado. */
  diasCriados: number;
}

export interface MarcacaoResponse {
  id: string;
  tipo: TipoMarcacao;
  /** "HH:MM" no fuso de negocio. */
  hora: string;
  /** Instante absoluto em ISO-8601, para auditoria e relatorio. */
  horario: string;
  origem: OrigemMarcacao;
  /** Verdadeiro quando a marcacao caiu no dia seguinte (turno da noite). */
  diaSeguinte: boolean;
}

/** Totais do dia, calculados pelo motor de apuracao (RF-020). */
export interface TotaisPontoResponse {
  minutosTrabalhados: number;
  minutosExtras50: number;
  minutosExtras100: number;
  minutosNoturnos: number;
  minutosAtraso: number;
  minutosFalta: number;
}

export interface DiaPontoResponse extends TotaisPontoResponse {
  id: string;
  periodoId: string;
  funcionarioId: string;
  /** "AAAA-MM-DD". */
  data: string;
  ocorrencia: OcorrenciaDia;
  statusEnvio: StatusEnvioDia;
  marcacoes: MarcacaoResponse[];
  observacao: string | null;
  apuradoEm: string | null;
  /**
   * Verdadeiro quando o usuario da requisicao ainda pode escrever neste dia
   * (RN-06 e RN-07). O front usa so para desabilitar campo; quem recusa a
   * escrita e o back-end.
   */
  editavel: boolean;
  atualizadoEm: string;
}

/** Jornada do vinculo vigente, o bastante para a grade montar o horario padrao. */
export interface JornadaResumoResponse {
  id: string;
  nome: string;
  entradaMinutos: number;
  saidaMinutos: number;
  intervaloMinutos: number;
  toleranciaMinutos: number;
  /** ISO-8601: 1 = segunda ... 7 = domingo. */
  diasSemana: number[];
}

export interface LinhaGradeResponse {
  funcionarioId: string;
  funcionarioNome: string;
  matricula: string;
  jornada: JornadaResumoResponse;
  /** Nulo quando o dia ainda nao foi gerado para este funcionario. */
  dia: DiaPontoResponse | null;
}

/** GET /api/ponto/grade (RF-013): equipe de uma obra em um dia. */
export interface GradeEquipeResponse {
  /** "AAAA-MM-DD". */
  data: string;
  obraId: string;
  obraNome: string;
  /** Nulo quando nao existe periodo aberto cobrindo a data. */
  periodo: PeriodoResponse | null;
  /** Descricao do feriado do dia, quando houver (RF-011, RN-03). */
  feriado: string | null;
  /** Dia da semana em ISO-8601 (1 = segunda). */
  diaSemana: number;
  linhas: LinhaGradeResponse[];
  /** Verdadeiro quando o usuario da requisicao pode lancar neste dia. */
  editavel: boolean;
}

/** Campo ao qual o erro de validacao se refere, para a tela destacar (T-038). */
export type CampoLancamento = TipoMarcacao | 'OCORRENCIA' | 'OBSERVACAO' | 'DIA';

export interface ErroLancamentoResponse {
  funcionarioId: string;
  /** "AAAA-MM-DD". */
  data: string;
  campo: CampoLancamento;
  motivo: string;
}

/**
 * Marcacoes de um dia em "HH:MM".
 *
 * Campo ausente mantem o que esta gravado; `null` apaga a marcacao. Assim a
 * grade pode enviar so o que o encarregado digitou.
 */
export interface MarcacoesLancamentoRequest {
  entrada?: string | null;
  saidaIntervalo?: string | null;
  retornoIntervalo?: string | null;
  saida?: string | null;
}

export interface ItemLancamentoEquipeRequest extends MarcacoesLancamentoRequest {
  funcionarioId: string;
  /** RF-015. Ocorrencia diferente de NORMAL apaga as marcacoes do dia. */
  ocorrencia?: OcorrenciaDia;
  observacao?: string | null;
}

/** PUT /api/ponto/grade (RF-013): lancamento em lote de uma equipe num dia. */
export interface LancarEquipeRequest {
  obraId: string;
  /** "AAAA-MM-DD". */
  data: string;
  itens: ItemLancamentoEquipeRequest[];
}

export interface DiaLancamentoRequest extends MarcacoesLancamentoRequest {
  /** "AAAA-MM-DD". */
  data: string;
  ocorrencia?: OcorrenciaDia;
  observacao?: string | null;
}

/** PUT /api/ponto/funcionarios/:id/dias (RF-014): semana ou mes de uma pessoa. */
export interface LancarFuncionarioRequest {
  dias: DiaLancamentoRequest[];
}

/**
 * Resultado do lancamento.
 *
 * Linha com erro nao e gravada e aparece em `erros`; as demais sao gravadas na
 * mesma transacao. Mesmo criterio da importacao de funcionarios (RF-012): uma
 * digitacao errada no meio da equipe nao descarta o trabalho inteiro.
 */
export interface LancarPontoResponse {
  salvos: number;
  dias: DiaPontoResponse[];
  erros: ErroLancamentoResponse[];
}

/** GET /api/ponto/funcionarios/:id (RF-014): visao semanal ou mensal. */
export interface PontoFuncionarioResponse {
  funcionarioId: string;
  funcionarioNome: string;
  matricula: string;
  /** "AAAA-MM-DD". */
  inicio: string;
  /** "AAAA-MM-DD". */
  fim: string;
  /** Periodos que cobrem o intervalo pedido. */
  periodos: PeriodoResponse[];
  dias: DiaPontoResponse[];
  /** Jornada vigente em cada dia do intervalo, por "AAAA-MM-DD". */
  jornadaPorDia: Record<string, JornadaResumoResponse>;
  /** Feriados do intervalo, por "AAAA-MM-DD". */
  feriados: Record<string, string>;
  /** Soma dos dias devolvidos, em minutos inteiros. */
  totais: TotaisPontoResponse;
}

// ---------------------------------------------------------------------------
// RF-017 - ajuste de marcacao com justificativa e historico
// ---------------------------------------------------------------------------

/**
 * A justificativa do ajuste e obrigatoria (RF-017) e precisa dizer algo: um
 * minimo de caracteres evita o "ok" que nao explica nada seis meses depois,
 * quando alguem reler o historico.
 */
/** Teto de registros devolvidos na linha do tempo de um dia. */
export const AJUSTE_HISTORICO_LIMITE = 100;

export const AJUSTE_JUSTIFICATIVA_TAMANHO_MINIMO = 10;
export const AJUSTE_JUSTIFICATIVA_TAMANHO_MAXIMO = 500;

/**
 * PUT /api/ponto/dias/:diaId/ajuste (RF-017).
 *
 * Mesma semantica de campo do lancamento: ausente mantem o que esta gravado,
 * `null` apaga a marcacao. A diferenca e a justificativa, que aqui e exigida, e
 * o historico, que registra campo a campo o que mudou.
 */
export interface AjustarDiaRequest extends MarcacoesLancamentoRequest {
  justificativa: string;
  ocorrencia?: OcorrenciaDia;
  observacao?: string | null;
}

/** Uma alteracao registrada no historico do dia (RF-017). */
export interface AjustePontoResponse {
  id: string;
  /** Campo alterado: uma das quatro marcacoes, a ocorrencia ou a observacao. */
  campo: CampoAjuste;
  /** "HH:MM" da marcacao, ou o texto anterior; nulo quando nao existia. */
  valorAnterior: string | null;
  /** "HH:MM" da marcacao, ou o texto novo; nulo quando foi apagada. */
  valorNovo: string | null;
  justificativa: string;
  usuarioNome: string;
  criadoEm: string;
}

/** Resposta do ajuste: o dia recalculado e a linha do tempo completa. */
export interface AjustarDiaResponse {
  dia: DiaPontoResponse;
  historico: AjustePontoResponse[];
}

// ---------------------------------------------------------------------------
// RF-018 - envio do periodo da equipe ao RH
// ---------------------------------------------------------------------------

/** Teto de funcionarios listados no resumo de pendencias do envio. */
export const PONTO_MAXIMO_PENDENCIAS_RESUMO = 50;

/** O que falta na equipe antes de o periodo seguir para o RH (RF-018). */
export interface PendenciaEnvioResponse {
  funcionarioId: string;
  funcionarioNome: string;
  matricula: string;
  /** Dias normais do periodo sem nenhuma marcacao, em "AAAA-MM-DD". */
  diasSemLancamento: string[];
  /** Dias com marcacao incompleta (sem entrada ou sem saida). */
  diasIncompletos: string[];
}

/** GET /api/ponto/periodos/:id/resumo-envio (RF-018). */
export interface ResumoEnvioRhResponse {
  periodo: PeriodoResponse;
  obraId: string;
  obraNome: string;
  funcionarios: number;
  /** Dias da equipe ja gerados no periodo. */
  dias: number;
  diasNaoEnviados: number;
  diasEnviados: number;
  /** Soma de dias sem lancamento e incompletos de toda a equipe. */
  totalPendencias: number;
  /** Limitada a PONTO_MAXIMO_PENDENCIAS_RESUMO funcionarios. */
  pendencias: PendenciaEnvioResponse[];
  /** Verdadeiro quando o usuario da requisicao ainda pode enviar (RN-06, RN-07). */
  podeEnviar: boolean;
  motivoBloqueio: string | null;
}

/** POST /api/ponto/periodos/:id/envio-rh (RF-018). */
export interface EnviarPeriodoRhRequest {
  obraId: string;
}

export interface EnviarPeriodoRhResponse {
  periodo: PeriodoResponse;
  /** Dias que passaram de NAO_ENVIADO para ENVIADO_RH agora. */
  diasEnviados: number;
  funcionarios: number;
  /** Pendencias que seguiram junto, para o RH saber o que conferir. */
  totalPendencias: number;
}

// ---------------------------------------------------------------------------
// RF-019 - importacao de marcacoes por CSV
// ---------------------------------------------------------------------------

/**
 * Colunas aceitas no cabecalho, ja normalizadas (sem acento, caixa ou
 * separador): "Saida_Intervalo" e "saída intervalo" chegam como
 * "saidaintervalo".
 *
 * Uma linha por dia de cada funcionario. `matricula` ou `cpf` identificam a
 * pessoa - pelo menos uma das duas e obrigatoria no cabecalho.
 */
export const IMPORTACAO_MARCACOES_COLUNAS = [
  'matricula',
  'cpf',
  'data',
  'entrada',
  'saidaintervalo',
  'retornointervalo',
  'saida',
  'ocorrencia',
  'observacao',
] as const;

/** Teto de linhas por arquivo. Acima disso a API recusa o CSV. */
export const IMPORTACAO_MARCACOES_MAXIMO_LINHAS = 5000;
/** Teto de tamanho do arquivo enviado, em bytes. */
export const IMPORTACAO_MARCACOES_TAMANHO_MAXIMO_BYTES = 2 * 1024 * 1024;
/** Extensoes aceitas no upload. */
export const IMPORTACAO_MARCACOES_EXTENSOES = ['.csv'] as const;

export interface ErroImportacaoMarcacao {
  /** Linha do arquivo, contando o cabecalho como linha 1. */
  linha: number;
  campo: string | null;
  mensagem: string;
}

/** Linha aceita, como ficara gravada. Sem CPF: a identificacao ja foi resolvida. */
export interface PreviaMarcacaoImportada {
  linha: number;
  funcionarioId: string;
  funcionarioNome: string;
  matricula: string;
  /** "AAAA-MM-DD". */
  data: string;
  entrada: string | null;
  saidaIntervalo: string | null;
  retornoIntervalo: string | null;
  saida: string | null;
  ocorrencia: OcorrenciaDia;
}

/**
 * Relatorio da importacao de marcacoes (RF-019).
 *
 * Mesmo criterio da importacao de funcionarios (RF-012): grava somente as
 * linhas sem erro e aponta linha, campo e motivo de cada recusa. Uma data
 * errada no meio do arquivo nao descarta o resto do trabalho.
 */
export interface ImportarMarcacoesResponse {
  totalLinhas: number;
  gravados: number;
  /** Linhas recusadas (linhas distintas com erro). */
  comErro: number;
  itens: PreviaMarcacaoImportada[];
  erros: ErroImportacaoMarcacao[];
}
