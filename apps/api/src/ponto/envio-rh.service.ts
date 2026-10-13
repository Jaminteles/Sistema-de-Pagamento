import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type EnviarPeriodoRhResponse,
  OcorrenciaDia,
  PONTO_MAXIMO_PENDENCIAS_RESUMO,
  type ResumoEnvioRhResponse,
  StatusEnvioDia,
  TipoMarcacao,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import type { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import { dateParaDataIso } from '../common/data/data-iso';
import { EscopoObraService } from '../obras/escopo-obra.service';
import { ObrasRepository } from '../obras/obras.repository';
import { bloqueioDeEscrita, paraPeriodoResponse } from './ponto.resposta';
import {
  type DiaPontoRegistro,
  type PeriodoRegistro,
  PontoRepository,
  type VinculoVigenteRegistro,
} from './ponto.repository';

/** Pendencias de um funcionario antes do envio (RF-018). */
interface PendenciaInterna {
  vinculo: VinculoVigenteRegistro;
  diasSemLancamento: string[];
  diasIncompletos: string[];
}

/**
 * Envio do periodo da equipe para conferencia do RH (T-041 / RF-018).
 *
 * Depois do envio o encarregado nao altera mais aquele dia (RN-06): o bloqueio
 * sai do statusEnvio do dia, que o lancamento e o ajuste ja consultam. Quando
 * nao sobra nenhum dia pendente no periodo, ele passa a EM_CONFERENCIA, que e
 * o estado em que o RH confere antes de fechar (sprint 7).
 *
 * O resumo de pendencias acompanha o envio porque o encarregado precisa saber o
 * que esta mandando: o painel completo de pendencias do periodo e outra coisa
 * (RF-022, sprint 7).
 *
 * Perfis: ADMIN, RH e ENCARREGADO - este ultimo somente nas obras dele (RN-05),
 * recorte aplicado a partir do usuario autenticado.
 */
@Injectable()
export class EnvioRhService {
  constructor(
    private readonly repositorio: PontoRepository,
    private readonly escopoObra: EscopoObraService,
    private readonly obras: ObrasRepository,
  ) {}

  /** GET: o que falta na equipe antes de enviar (RF-018). */
  async resumo(
    periodoId: string,
    obraId: string,
    usuario: UsuarioRequisicao,
  ): Promise<ResumoEnvioRhResponse> {
    const { periodo, obraNome, equipe, dias } = await this.carregar(periodoId, obraId, usuario);

    const pendencias = this.pendencias(equipe, dias);
    const bloqueio = bloqueioDeEscrita(usuario, periodo, null);

    return {
      periodo: paraPeriodoResponse(periodo),
      obraId,
      obraNome,
      funcionarios: equipe.length,
      dias: dias.length,
      diasNaoEnviados: dias.filter((dia) => dia.statusEnvio === StatusEnvioDia.NAO_ENVIADO).length,
      diasEnviados: dias.filter((dia) => dia.statusEnvio !== StatusEnvioDia.NAO_ENVIADO).length,
      totalPendencias: this.totalPendencias(pendencias),
      pendencias: pendencias.slice(0, PONTO_MAXIMO_PENDENCIAS_RESUMO).map((item) => ({
        funcionarioId: item.vinculo.funcionarioId,
        funcionarioNome: item.vinculo.funcionarioNome,
        matricula: item.vinculo.matricula,
        diasSemLancamento: item.diasSemLancamento,
        diasIncompletos: item.diasIncompletos,
      })),
      podeEnviar: bloqueio === null,
      motivoBloqueio: bloqueio?.motivo ?? null,
    };
  }

  /**
   * POST: envia o periodo da equipe ao RH (RF-018).
   *
   * Idempotente: so os dias NAO_ENVIADO mudam de estado, e clique duplo nao
   * conta o mesmo dia duas vezes nem reabre nada.
   */
  async enviar(
    periodoId: string,
    obraId: string,
    usuario: UsuarioRequisicao,
    coletor: ColetorAuditoria,
  ): Promise<EnviarPeriodoRhResponse> {
    const { periodo, equipe, dias } = await this.carregar(periodoId, obraId, usuario);

    const bloqueio = bloqueioDeEscrita(usuario, periodo, null);
    if (bloqueio) {
      // RN-07 (periodo fechado) e RN-06 (encarregado depois do envio).
      throw new ConflictException(bloqueio.motivo);
    }

    const pendencias = this.pendencias(equipe, dias);
    const funcionariosIds = equipe.map((vinculo) => vinculo.funcionarioId);

    const { diasEnviados, periodo: atualizado } = await this.repositorio.enviarAoRh(
      periodo.id,
      funcionariosIds,
    );

    coletor.anotar({
      entidadeId: periodo.id,
      depois: {
        competencia: periodo.competencia,
        obraId,
        funcionarios: funcionariosIds.length,
        diasEnviados,
        pendencias: this.totalPendencias(pendencias),
        statusPeriodo: atualizado.status,
      },
    });

    return {
      periodo: paraPeriodoResponse(atualizado),
      diasEnviados,
      funcionarios: funcionariosIds.length,
      totalPendencias: this.totalPendencias(pendencias),
    };
  }

  /**
   * Periodo, obra, equipe e dias, com o escopo do encarregado ja aplicado.
   *
   * Obra fora do escopo responde 404 (e nao 403) para nao confirmar a
   * existencia do cadastro pelo id enviado.
   */
  private async carregar(
    periodoId: string,
    obraId: string,
    usuario: UsuarioRequisicao,
  ): Promise<{
    periodo: PeriodoRegistro;
    obraNome: string;
    equipe: VinculoVigenteRegistro[];
    dias: DiaPontoRegistro[];
  }> {
    await this.escopoObra.garantirAcessoAObra(usuario, obraId);

    const [periodo, obra] = await Promise.all([
      this.repositorio.buscarPeriodo(periodoId),
      this.obras.buscarPorId(obraId),
    ]);

    if (!periodo) {
      throw new NotFoundException('Periodo nao encontrado.');
    }
    if (!obra) {
      throw new NotFoundException('Obra nao encontrada.');
    }

    const vinculos = await this.repositorio.vinculosNoIntervalo(
      periodo.dataInicio,
      periodo.dataFim,
      {
        obrasPermitidas: [obraId],
      },
    );

    // Um funcionario pode ter mais de um vinculo na mesma obra no mes (troca de
    // jornada): a equipe e por pessoa, nao por vinculo.
    const equipe = [
      ...new Map(vinculos.map((vinculo) => [vinculo.funcionarioId, vinculo])).values(),
    ].sort((a, b) => a.funcionarioNome.localeCompare(b.funcionarioNome));

    const dias =
      equipe.length === 0
        ? []
        : await this.repositorio.diasDoPeriodo(
            periodo.id,
            equipe.map((vinculo) => vinculo.funcionarioId),
          );

    return { periodo, obraNome: obra.nome, equipe, dias };
  }

  /**
   * O que o RH vai encontrar: dia normal sem nenhuma marcacao e dia com
   * marcacao pela metade (sem entrada ou sem saida).
   *
   * Dia que nunca foi gerado nao entra: a geracao e do periodo (RF-013) e
   * acusar aqui confundiria falta de lancamento com falta de vinculo.
   */
  private pendencias(
    equipe: readonly VinculoVigenteRegistro[],
    dias: readonly DiaPontoRegistro[],
  ): PendenciaInterna[] {
    const porFuncionario = new Map<string, DiaPontoRegistro[]>();
    for (const dia of dias) {
      porFuncionario.set(dia.funcionarioId, [
        ...(porFuncionario.get(dia.funcionarioId) ?? []),
        dia,
      ]);
    }

    const pendencias: PendenciaInterna[] = [];

    for (const vinculo of equipe) {
      const diasSemLancamento: string[] = [];
      const diasIncompletos: string[] = [];

      for (const dia of porFuncionario.get(vinculo.funcionarioId) ?? []) {
        if (dia.ocorrencia !== OcorrenciaDia.NORMAL) {
          continue;
        }
        if (dia.marcacoes.length === 0) {
          diasSemLancamento.push(dateParaDataIso(dia.data));
          continue;
        }
        const tem = (tipo: TipoMarcacao): boolean =>
          dia.marcacoes.some((marcacao) => marcacao.tipo === tipo);
        if (!tem(TipoMarcacao.ENTRADA) || !tem(TipoMarcacao.SAIDA)) {
          diasIncompletos.push(dateParaDataIso(dia.data));
        }
      }

      if (diasSemLancamento.length > 0 || diasIncompletos.length > 0) {
        pendencias.push({ vinculo, diasSemLancamento, diasIncompletos });
      }
    }

    return pendencias;
  }

  private totalPendencias(pendencias: readonly PendenciaInterna[]): number {
    return pendencias.reduce(
      (total, item) => total + item.diasSemLancamento.length + item.diasIncompletos.length,
      0,
    );
  }
}
