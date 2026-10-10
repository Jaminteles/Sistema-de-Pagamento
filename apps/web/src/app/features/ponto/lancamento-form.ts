import { FormControl, FormGroup, Validators } from '@angular/forms';
import {
  type DiaPontoResponse,
  type JornadaResumoResponse,
  type MarcacoesLancamentoRequest,
  minutosParaHora,
  OcorrenciaDia,
  TipoMarcacao,
} from '@sistema/shared';

/**
 * Formulario de um dia de ponto, compartilhado pela grade por equipe (T-036) e
 * pela tela por funcionario (T-037).
 *
 * As validacoes aqui espelham os DTOs do back-end (HH:MM e ocorrencia da
 * lista): servem para o usuario ver o erro antes de enviar. A validacao que
 * vale - ordem, sobreposicao, intervalo minimo, periodo fechado - continua
 * sendo a da API.
 */

export const PADRAO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface CamposLancamento {
  ocorrencia: FormControl<OcorrenciaDia>;
  entrada: FormControl<string>;
  saidaIntervalo: FormControl<string>;
  retornoIntervalo: FormControl<string>;
  saida: FormControl<string>;
  observacao: FormControl<string>;
}

export type GrupoLancamento = FormGroup<CamposLancamento>;

/** Horarios do dia na ordem em que aparecem na tela. */
export const CAMPOS_HORA: readonly {
  campo: keyof CamposLancamento;
  tipo: TipoMarcacao;
  rotulo: string;
}[] = [
  { campo: 'entrada', tipo: TipoMarcacao.ENTRADA, rotulo: 'Entrada' },
  { campo: 'saidaIntervalo', tipo: TipoMarcacao.SAIDA_INTERVALO, rotulo: 'Saida int.' },
  { campo: 'retornoIntervalo', tipo: TipoMarcacao.RETORNO_INTERVALO, rotulo: 'Volta int.' },
  { campo: 'saida', tipo: TipoMarcacao.SAIDA, rotulo: 'Saida' },
];

function controleHora(valor: string): FormControl<string> {
  return new FormControl<string>(valor, {
    nonNullable: true,
    validators: [Validators.pattern(PADRAO_HORA)],
  });
}

/** "HH:MM" da marcacao do dia, ou "" quando ela nao existe. */
export function horaDoDia(dia: DiaPontoResponse | null, tipo: TipoMarcacao): string {
  return dia?.marcacoes.find((marcacao) => marcacao.tipo === tipo)?.hora ?? '';
}

export function criarGrupo(dia: DiaPontoResponse | null): GrupoLancamento {
  const grupo = new FormGroup<CamposLancamento>({
    ocorrencia: new FormControl<OcorrenciaDia>(dia?.ocorrencia ?? OcorrenciaDia.NORMAL, {
      nonNullable: true,
    }),
    entrada: controleHora(horaDoDia(dia, TipoMarcacao.ENTRADA)),
    saidaIntervalo: controleHora(horaDoDia(dia, TipoMarcacao.SAIDA_INTERVALO)),
    retornoIntervalo: controleHora(horaDoDia(dia, TipoMarcacao.RETORNO_INTERVALO)),
    saida: controleHora(horaDoDia(dia, TipoMarcacao.SAIDA)),
    observacao: new FormControl<string>(dia?.observacao ?? '', { nonNullable: true }),
  });

  // Dia de periodo fechado ou ja enviado ao RH chega como nao editavel; o
  // bloqueio de verdade e o do back-end (RN-06 e RN-07).
  if (dia !== null && !dia.editavel) {
    grupo.disable();
  }

  return grupo;
}

/** Valor do grupo em texto, para comparar com o que foi carregado. */
export function assinatura(grupo: GrupoLancamento): string {
  const valores = grupo.getRawValue();
  return [
    valores.ocorrencia,
    valores.entrada,
    valores.saidaIntervalo,
    valores.retornoIntervalo,
    valores.saida,
    valores.observacao,
  ].join('|');
}

/**
 * Converte o grupo no corpo esperado pela API.
 *
 * Campo vazio vira `null`, que apaga a marcacao; a API trata campo ausente como
 * "mantem o que esta gravado", e aqui a tela sempre envia os quatro.
 *
 * Ocorrencia sem trabalho nao envia horario nenhum: a API recusa os dois juntos
 * (RF-015) e e ela que apaga o que estava gravado.
 */
export function paraMarcacoes(grupo: GrupoLancamento): MarcacoesLancamentoRequest {
  const valores = grupo.getRawValue();
  if (valores.ocorrencia !== OcorrenciaDia.NORMAL) {
    return {};
  }
  return {
    entrada: valores.entrada === '' ? null : valores.entrada,
    saidaIntervalo: valores.saidaIntervalo === '' ? null : valores.saidaIntervalo,
    retornoIntervalo: valores.retornoIntervalo === '' ? null : valores.retornoIntervalo,
    saida: valores.saida === '' ? null : valores.saida,
  };
}

/**
 * Preenche entrada e saida com o horario da jornada do vinculo (RNF-02).
 *
 * Nao inventa horario de intervalo: a jornada cadastrada guarda a duracao do
 * intervalo, nao a hora em que ele comeca. O encarregado digita o intervalo uma
 * vez e usa "replicar" para o resto da equipe.
 */
export function aplicarHorarioDaJornada(
  grupo: GrupoLancamento,
  jornada: JornadaResumoResponse,
): void {
  if (grupo.disabled || grupo.controls.ocorrencia.value !== OcorrenciaDia.NORMAL) {
    return;
  }
  grupo.patchValue({
    entrada: minutosParaHora(jornada.entradaMinutos),
    saida: minutosParaHora(jornada.saidaMinutos),
  });
}

/** Copia os quatro horarios de um grupo para outro. */
export function replicarHorarios(origem: GrupoLancamento, destino: GrupoLancamento): void {
  if (destino.disabled || destino.controls.ocorrencia.value !== OcorrenciaDia.NORMAL) {
    return;
  }
  const valores = origem.getRawValue();
  destino.patchValue({
    entrada: valores.entrada,
    saidaIntervalo: valores.saidaIntervalo,
    retornoIntervalo: valores.retornoIntervalo,
    saida: valores.saida,
  });
}
