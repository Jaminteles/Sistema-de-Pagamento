import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  aceitaMarcacao,
  AJUSTE_HISTORICO_LIMITE,
  type AjustarDiaResponse,
  type AjustePontoResponse,
  CampoAjuste,
  minutosParaHora,
  OcorrenciaDia,
  OCORRENCIA_DIA_LABEL,
  ORDEM_MARCACAO,
  OrigemMarcacao,
  TipoMarcacao,
} from '@sistema/shared';
import { ApuracaoService } from '../apuracao/apuracao.service';
import type { UsuarioRequisicao } from '../auth/tipos';
import type { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import { adicionarDias, dateParaDataIso } from '../common/data/data-iso';
import { horaLocalParaInstante } from '../common/data/fuso-negocio';
import { EscopoFuncionarioService } from '../funcionarios/escopo-funcionario.service';
import type { AjustarDiaDto } from './dto/ajustar-dia.dto';
import { type HorariosDigitados, mesclarMarcacoes, minutosDaMarcacao } from './marcacoes-do-dia';
import {
  bloqueioDeEscrita,
  paraAjusteResponse,
  paraDiaResponse,
  podeEscrever,
} from './ponto.resposta';
import {
  type AjusteGravavel,
  type DiaPontoRegistro,
  type MarcacaoGravavel,
  PontoRepository,
} from './ponto.repository';
import { type MarcacaoResolvida, validarMarcacoes } from './validacao-marcacoes';

/** Horarios do corpo do ajuste, na forma que o mesclador entende. */
function horariosDoDto(dto: AjustarDiaDto): HorariosDigitados {
  const horarios: HorariosDigitados = {};
  if (dto.entrada !== undefined) {
    horarios[TipoMarcacao.ENTRADA] = dto.entrada;
  }
  if (dto.saidaIntervalo !== undefined) {
    horarios[TipoMarcacao.SAIDA_INTERVALO] = dto.saidaIntervalo;
  }
  if (dto.retornoIntervalo !== undefined) {
    horarios[TipoMarcacao.RETORNO_INTERVALO] = dto.retornoIntervalo;
  }
  if (dto.saida !== undefined) {
    horarios[TipoMarcacao.SAIDA] = dto.saida;
  }
  return horarios;
}

/**
 * Ajuste de ponto ja lancado, com justificativa obrigatoria e historico
 * (T-040 / RF-017).
 *
 * Por que uma rota separada do lancamento: o lancamento e um lote que recusa
 * linha a linha e segue em frente; o ajuste e uma correcao pontual, precisa de
 * justificativa e nao pode ser aceito "pela metade". Aqui, ou o dia inteiro e
 * corrigido, ou a chamada falha com o motivo.
 *
 * Quem ajusta, pela linha "Ajustar ponto ja lancado" da matriz da secao 3 do
 * Levantamento de Requisitos: ADMIN e RH sempre; ENCARREGADO somente antes do
 * envio ao RH (RN-06) e so na equipe dele (RN-05). Periodo fechado nao aceita
 * ajuste de ninguem (RN-07).
 */
@Injectable()
export class AjusteService {
  constructor(
    private readonly repositorio: PontoRepository,
    private readonly apuracao: ApuracaoService,
    private readonly escopoFuncionario: EscopoFuncionarioService,
  ) {}

  async ajustar(
    diaPontoId: string,
    dto: AjustarDiaDto,
    usuario: UsuarioRequisicao,
    coletor: ColetorAuditoria,
  ): Promise<AjustarDiaResponse> {
    const dia = await this.exigirDia(diaPontoId, usuario);
    const dataIso = dateParaDataIso(dia.data);

    const periodo = await this.repositorio.buscarPeriodo(dia.periodoId);
    const bloqueio = bloqueioDeEscrita(usuario, periodo, dia);
    if (bloqueio) {
      // 409 e nao 403: o perfil tem a permissao, o estado do periodo e que nao
      // aceita mais escrita (RN-06 e RN-07).
      throw new ConflictException(bloqueio.motivo);
    }

    const ocorrencia = dto.ocorrencia ?? dia.ocorrencia;
    const observacao = this.observacaoFinal(dto, dia);
    const resolvidas = await this.resolverMarcacoes(dia, dataIso, dto, ocorrencia);

    const alteracoes = this.alteracoesDoDia(dia, dataIso, resolvidas, ocorrencia, observacao);
    if (alteracoes.length === 0) {
      throw new BadRequestException(
        'Nenhum campo foi alterado. O ajuste existe para registrar mudanca, com justificativa.',
      );
    }

    const presentes = new Set(resolvidas.map((item) => item.tipo));
    const marcacoes: MarcacaoGravavel[] = resolvidas.map((marcacao) => ({
      tipo: marcacao.tipo,
      horario: horaLocalParaInstante(dataIso, marcacao.absoluto),
      // Marcacao tocada por ajuste deixa de ser "o que o encarregado digitou".
      origem: OrigemMarcacao.AJUSTE,
    }));

    const gravado = await this.repositorio.ajustar({
      diaPontoId,
      ocorrencia,
      observacao,
      marcacoes,
      remover: ORDEM_MARCACAO.filter((tipo) => !presentes.has(tipo)),
      justificativa: dto.justificativa.trim(),
      usuarioId: usuario.id,
      alteracoes,
    });

    const [atualizado] = await this.apuracao.apurar([gravado]);
    const diaFinal = atualizado ?? gravado;

    coletor.anotar({
      entidadeId: diaPontoId,
      antes: {
        data: dataIso,
        funcionarioId: dia.funcionarioId,
        ocorrencia: dia.ocorrencia,
        marcacoes: this.resumoMarcacoes(dia),
      },
      depois: {
        ocorrencia: diaFinal.ocorrencia,
        marcacoes: this.resumoMarcacoes(diaFinal),
        camposAlterados: alteracoes.map((alteracao) => alteracao.campo),
        justificativa: dto.justificativa.trim(),
      },
    });

    return {
      dia: paraDiaResponse(diaFinal, podeEscrever(usuario, periodo, diaFinal)),
      historico: await this.historico(diaPontoId, usuario),
    };
  }

  /** Linha do tempo do dia (RF-017), do ajuste mais recente para o mais antigo. */
  async historico(diaPontoId: string, usuario: UsuarioRequisicao): Promise<AjustePontoResponse[]> {
    await this.exigirDia(diaPontoId, usuario);
    const registros = await this.repositorio.historicoDoDia(diaPontoId, AJUSTE_HISTORICO_LIMITE);
    return registros.map(paraAjusteResponse);
  }

  /**
   * Carrega o dia e aplica o escopo do encarregado (RN-05).
   *
   * Responde 404 tanto para id inexistente quanto para dia de funcionario fora
   * do escopo: 403 confirmaria a existencia do registro e permitiria enumerar
   * ids pela rota.
   */
  private async exigirDia(
    diaPontoId: string,
    usuario: UsuarioRequisicao,
  ): Promise<DiaPontoRegistro> {
    const dia = await this.repositorio.buscarDia(diaPontoId);
    if (!dia) {
      throw new NotFoundException('Dia de ponto nao encontrado.');
    }
    await this.escopoFuncionario.garantirAcesso(usuario, dia.funcionarioId);
    return dia;
  }

  /**
   * Resolve as marcacoes finais do dia e cobra as regras do RF-016.
   *
   * Erro de digitacao sai como 400 com a lista de motivos, campo a campo: aqui
   * o usuario esta corrigindo um dia so, e aceitar metade do ajuste deixaria o
   * dia num estado que ninguem pediu.
   */
  private async resolverMarcacoes(
    dia: DiaPontoRegistro,
    dataIso: string,
    dto: AjustarDiaDto,
    ocorrencia: OcorrenciaDia,
  ): Promise<MarcacaoResolvida[]> {
    const horarios = horariosDoDto(dto);

    if (!aceitaMarcacao(ocorrencia)) {
      const informouHorario = ORDEM_MARCACAO.some((tipo) => typeof horarios[tipo] === 'string');
      if (informouHorario) {
        throw new BadRequestException(
          `A ocorrencia ${OCORRENCIA_DIA_LABEL[ocorrencia]} nao aceita marcacao de horario.`,
        );
      }
      return [];
    }

    const digitadas = mesclarMarcacoes(horarios, dia, dataIso);
    if (digitadas === null) {
      throw new BadRequestException('Informe o horario em HH:MM.');
    }

    const [vinculos, vizinhos] = await Promise.all([
      this.repositorio.vinculosNoIntervalo(dia.data, dia.data, {
        funcionarioId: dia.funcionarioId,
      }),
      this.repositorio.dias(
        [dia.funcionarioId],
        adicionarDias(dia.data, -1),
        adicionarDias(dia.data, 1),
      ),
    ]);

    const vinculo = vinculos.find(
      (item) =>
        item.inicioVigencia <= dia.data &&
        (item.fimVigencia === null || item.fimVigencia >= dia.data),
    );

    const validacao = validarMarcacoes(digitadas, {
      intervaloMinimoMinutos: Math.max(0, vinculo?.jornada.intervaloMinutos ?? 0),
      vizinhas: this.ocupacoesVizinhas(dia, dataIso, vizinhos),
    });

    if (!validacao.valido) {
      throw new BadRequestException(validacao.erros.map((erro) => erro.motivo));
    }

    return validacao.marcacoes;
  }

  /** Dias vizinhos ocupados, em minutos relativos a este dia (RF-016). */
  private ocupacoesVizinhas(
    dia: DiaPontoRegistro,
    dataIso: string,
    vizinhos: readonly DiaPontoRegistro[],
  ): { data: string; inicio: number; fim: number }[] {
    const meiaNoite = horaLocalParaInstante(dataIso, 0).getTime();

    return vizinhos
      .filter((item) => item.id !== dia.id && item.marcacoes.length > 0)
      .map((item) => {
        const instantes = item.marcacoes.map((marcacao) => marcacao.horario.getTime());
        return {
          data: dateParaDataIso(item.data),
          inicio: Math.round((Math.min(...instantes) - meiaNoite) / 60_000),
          fim: Math.round((Math.max(...instantes) - meiaNoite) / 60_000),
        };
      });
  }

  /** O que mudou em relacao ao que estava gravado, campo a campo (RF-017). */
  private alteracoesDoDia(
    dia: DiaPontoRegistro,
    dataIso: string,
    resolvidas: readonly MarcacaoResolvida[],
    ocorrencia: OcorrenciaDia,
    observacao: string | null,
  ): AjusteGravavel[] {
    const alteracoes: AjusteGravavel[] = [];

    for (const tipo of ORDEM_MARCACAO) {
      const atual = dia.marcacoes.find((item) => item.tipo === tipo) ?? null;
      const nova = resolvidas.find((item) => item.tipo === tipo) ?? null;
      const horarioNovo = nova === null ? null : horaLocalParaInstante(dataIso, nova.absoluto);

      const anterior = atual?.horario ?? null;
      if (anterior?.getTime() === horarioNovo?.getTime()) {
        continue;
      }

      alteracoes.push({
        campo: tipo,
        marcacaoId: horarioNovo === null ? (atual?.id ?? null) : null,
        valorAnterior: anterior,
        valorNovo: horarioNovo,
      });
    }

    if (ocorrencia !== dia.ocorrencia) {
      alteracoes.push({
        campo: CampoAjuste.OCORRENCIA,
        textoAnterior: dia.ocorrencia,
        textoNovo: ocorrencia,
      });
    }

    if (observacao !== dia.observacao) {
      alteracoes.push({
        campo: CampoAjuste.OBSERVACAO,
        textoAnterior: dia.observacao,
        textoNovo: observacao,
      });
    }

    return alteracoes;
  }

  private observacaoFinal(dto: AjustarDiaDto, dia: DiaPontoRegistro): string | null {
    if (dto.observacao === undefined) {
      return dia.observacao;
    }
    const limpo = (dto.observacao ?? '').trim();
    return limpo.length === 0 ? null : limpo;
  }

  /** Horarios do dia em "HH:MM", para o log de auditoria (RF-005). */
  private resumoMarcacoes(dia: DiaPontoRegistro): Record<string, string> {
    const dataIso = dateParaDataIso(dia.data);
    const resumo: Record<string, string> = {};

    for (const marcacao of dia.marcacoes) {
      resumo[marcacao.tipo] = minutosParaHora(minutosDaMarcacao(marcacao.horario, dataIso));
    }

    return resumo;
  }
}
