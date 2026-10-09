import { BadRequestException, Injectable } from '@nestjs/common';
import {
  chavePixValida,
  type DadosPagamentoResponse,
  mascararChavePix,
  mascararConta,
  normalizarChavePix,
  type TipoChavePix,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import type { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import { CriptografiaService } from '../common/crypto/criptografia.service';
import type { DefinirDadosPagamentoDto } from './dto/definir-dados-pagamento.dto';
import { EscopoFuncionarioService } from './escopo-funcionario.service';
import { podeVerDadoCompleto } from './funcionario.resposta';
import {
  type DadosPagamentoGravaveis,
  type DadosPagamentoRegistro,
  FuncionariosRepository,
} from './funcionarios.repository';

/** Texto opcional: string vazia conta como ausente. */
function texto(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Resposta de funcionario sem dados de pagamento cadastrados. */
function respostaVazia(funcionarioId: string, mascarado: boolean): DadosPagamentoResponse {
  return {
    funcionarioId,
    tipoChave: null,
    chavePix: null,
    chavePixMascara: null,
    banco: null,
    agencia: null,
    conta: null,
    contaMascara: null,
    mascarado,
    validadoEm: null,
    atualizadoEm: null,
  };
}

/**
 * Dados de pagamento do funcionario (RF-007, RNF-04, RNF-05).
 *
 * Chave Pix e conta sao criptografadas antes de ir para o banco, com chave
 * vinda de variavel de ambiente (RNF-04). A resposta devolve o valor em claro
 * somente para os perfis que a matriz da secao 3 autoriza a ver dados
 * bancarios; para os demais, apenas a mascara (RNF-05).
 *
 * Nenhum valor sensivel entra em log: a auditoria registra o que mudou em forma
 * de indicador (tipo da chave, se existe chave, se existe conta), nunca o
 * numero.
 */
@Injectable()
export class DadosPagamentoService {
  constructor(
    private readonly repositorio: FuncionariosRepository,
    private readonly escopo: EscopoFuncionarioService,
    private readonly cripto: CriptografiaService,
  ) {}

  async buscar(
    funcionarioId: string,
    usuario: UsuarioRequisicao,
  ): Promise<DadosPagamentoResponse> {
    await this.escopo.garantirAcesso(usuario, funcionarioId);

    const completo = podeVerDadoCompleto(usuario);
    const registro = await this.repositorio.dadosPagamento(funcionarioId);

    if (!registro) {
      return respostaVazia(funcionarioId, !completo);
    }
    return this.paraResposta(registro, completo);
  }

  /**
   * Substitui os dados de pagamento (RF-007).
   *
   * Corpo com tudo nulo limpa o cadastro - e o funcionario deixa de entrar em
   * lote de pagamento (RN-08). Acao sensivel, registrada no log de auditoria
   * (RF-005).
   */
  async definir(
    funcionarioId: string,
    dto: DefinirDadosPagamentoDto,
    usuario: UsuarioRequisicao,
    coletor: ColetorAuditoria,
  ): Promise<DadosPagamentoResponse> {
    await this.escopo.garantirAcesso(usuario, funcionarioId);

    const anterior = await this.repositorio.dadosPagamento(funcionarioId);
    const gravaveis = this.montarGravaveis(dto);

    const atualizado = await this.repositorio.definirDadosPagamento(funcionarioId, gravaveis);

    coletor.anotar({
      entidadeId: funcionarioId,
      antes: this.resumoParaAuditoria(anterior),
      depois: this.resumoParaAuditoria(atualizado),
    });

    return this.paraResposta(atualizado, podeVerDadoCompleto(usuario));
  }

  /**
   * Valida a coerencia e criptografa o que e sensivel.
   *
   * Chave Pix exige o tipo (o formato valido depende dele) e banco, agencia e
   * conta andam juntos: conta pela metade nao serve para pagar e passaria pela
   * conferencia da sprint 8 como se servisse.
   */
  private montarGravaveis(dto: DefinirDadosPagamentoDto): DadosPagamentoGravaveis {
    const tipoChave: TipoChavePix | null = dto.tipoChave ?? null;
    const chaveBruta = texto(dto.chavePix);

    if ((tipoChave === null) !== (chaveBruta === null)) {
      throw new BadRequestException('Informe o tipo e a chave Pix juntos.');
    }

    let chavePixCriptografada: string | null = null;
    let chavePixMascara: string | null = null;

    if (tipoChave !== null && chaveBruta !== null) {
      if (!chavePixValida(tipoChave, chaveBruta)) {
        throw new BadRequestException('Chave Pix invalida para o tipo informado.');
      }
      const chave = normalizarChavePix(tipoChave, chaveBruta);
      chavePixCriptografada = this.cripto.criptografar(chave);
      chavePixMascara = mascararChavePix(tipoChave, chave);
    }

    const banco = texto(dto.banco);
    const agencia = texto(dto.agencia);
    const conta = texto(dto.conta);
    const partes = [banco, agencia, conta].filter((parte) => parte !== null);

    if (partes.length > 0 && partes.length < 3) {
      throw new BadRequestException('Informe banco, agencia e conta juntos.');
    }

    return {
      tipoChave,
      chavePixCriptografada,
      chavePixMascara,
      banco,
      agencia,
      contaCriptografada: conta === null ? null : this.cripto.criptografar(conta),
      contaMascara: conta === null ? null : mascararConta(conta),
    };
  }

  private paraResposta(
    registro: DadosPagamentoRegistro,
    completo: boolean,
  ): DadosPagamentoResponse {
    return {
      funcionarioId: registro.funcionarioId,
      tipoChave: registro.tipoChave,
      chavePix: completo ? this.emClaro(registro.chavePixCriptografada) : null,
      chavePixMascara: registro.chavePixMascara,
      banco: registro.banco,
      agencia: completo ? registro.agencia : null,
      conta: completo ? this.emClaro(registro.contaCriptografada) : null,
      contaMascara: registro.contaMascara,
      mascarado: !completo,
      validadoEm: registro.validadoEm?.toISOString() ?? null,
      atualizadoEm: registro.atualizadoEm.toISOString(),
    };
  }

  /**
   * Decifra para o perfil autorizado. Conteudo ilegivel (chave de criptografia
   * trocada) nao derruba a tela: devolve nulo e a mascara continua visivel.
   */
  private emClaro(conteudo: string | null): string | null {
    if (conteudo === null) {
      return null;
    }
    try {
      return this.cripto.descriptografar(conteudo);
    } catch {
      return null;
    }
  }

  /**
   * Resumo auditavel da mudanca: nunca a chave, a conta ou a agencia, apenas
   * indicadores de que existem (RF-005).
   */
  private resumoParaAuditoria(registro: DadosPagamentoRegistro | null): {
    tipoChave: string | null;
    chaveDefinida: boolean;
    contaDefinida: boolean;
  } {
    return {
      tipoChave: registro?.tipoChave ?? null,
      chaveDefinida: (registro?.chavePixCriptografada ?? null) !== null,
      contaDefinida: (registro?.contaCriptografada ?? null) !== null,
    };
  }
}
