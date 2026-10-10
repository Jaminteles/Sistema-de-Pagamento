import {
  formatarCpf,
  type FuncionarioResponse,
  mascararCpf,
  PerfilUsuario,
  type VinculoFuncionarioResponse,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import { dateParaDataIso } from '../common/data/data-iso';
import { hojeNoFusoDeNegocio } from '../common/data/fuso-negocio';
import type { FuncionarioRegistro, VinculoRegistro } from './funcionarios.repository';

/**
 * Perfis que podem ver CPF e dados bancarios completos, conforme a linha "Ver
 * dados bancarios completos" da matriz da secao 3 do Levantamento de
 * Requisitos. Para os demais, a resposta sai mascarada (RNF-05).
 *
 * O encarregado fica de fora: ele lanca ponto da equipe e nao precisa do CPF
 * nem da conta de ninguem.
 */
const PERFIS_COM_DADO_COMPLETO: readonly PerfilUsuario[] = [
  PerfilUsuario.ADMIN,
  PerfilUsuario.RH,
  PerfilUsuario.FINANCEIRO,
];

export function podeVerDadoCompleto(usuario: UsuarioRequisicao): boolean {
  return PERFIS_COM_DADO_COMPLETO.includes(usuario.perfil);
}

/**
 * Dia de hoje no fuso de negocio America/Bahia (RNF-12).
 *
 * Reexportado do helper comum para os imports existentes deste modulo
 * continuarem valendo; a conversao de fuso vive em common/data/fuso-negocio,
 * que o modulo de ponto tambem usa.
 */
export { hojeNoFusoDeNegocio };

export function paraVinculoResponse(registro: VinculoRegistro): VinculoFuncionarioResponse {
  return {
    id: registro.id,
    funcionarioId: registro.funcionarioId,
    obraId: registro.obraId,
    obraNome: registro.obraNome,
    jornadaId: registro.jornadaId,
    jornadaNome: registro.jornadaNome,
    inicioVigencia: dateParaDataIso(registro.inicioVigencia),
    fimVigencia: registro.fimVigencia ? dateParaDataIso(registro.fimVigencia) : null,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

/**
 * Converte o registro do banco na resposta da API.
 *
 * O CPF sai sempre formatado e, quando `dadoCompleto` e falso, mascarado aqui -
 * no back-end. Mascarar apenas no front-end deixaria o numero completo na
 * resposta HTTP, o que nao atende a RNF-05.
 */
export function paraFuncionarioResponse(
  registro: FuncionarioRegistro,
  dadoCompleto: boolean,
): FuncionarioResponse {
  return {
    id: registro.id,
    cpf: dadoCompleto ? formatarCpf(registro.cpf) : mascararCpf(registro.cpf),
    cpfMascarado: !dadoCompleto,
    nome: registro.nome,
    matricula: registro.matricula,
    cargo: registro.cargo,
    admissao: dateParaDataIso(registro.admissao),
    desligamento: registro.desligamento ? dateParaDataIso(registro.desligamento) : null,
    situacao: registro.situacao,
    vinculoAtual: registro.vinculoAtual ? paraVinculoResponse(registro.vinculoAtual) : null,
    temDadosPagamento: registro.temDadosPagamento,
    criadoEm: registro.criadoEm.toISOString(),
    atualizadoEm: registro.atualizadoEm.toISOString(),
  };
}
