import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AcaoAuditoria,
  type ApurarPeriodoResponse,
  type EnviarPeriodoRhResponse,
  type GerarDiasResponse,
  type PeriodoResponse,
  PerfilUsuario,
  type RespostaPaginada,
  type ResumoEnvioRhResponse,
} from '@sistema/shared';
import type { Request } from 'express';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import type { UsuarioRequisicao } from '../auth/tipos';
import { Auditar } from '../common/auditoria/auditoria.decorator';
import { coletorDe } from '../common/auditoria/coletor-auditoria';
import { AbrirPeriodoDto } from './dto/abrir-periodo.dto';
import { EnviarPeriodoRhDto, ResumoEnvioQuery } from './dto/envio-rh.dto';
import { ListarPeriodosQuery } from './dto/listar-periodos.query';
import { EnvioRhService } from './envio-rh.service';
import { PeriodosService } from './periodos.service';

/**
 * Periodo de apuracao (T-031 / RF-013).
 *
 * Perfis, conforme a matriz da secao 3 do Levantamento de Requisitos:
 *   - abrir e gerar dias: ADMIN e RH (a mesma dupla que fecha e reabre);
 *   - consultar: ADMIN, RH e ENCARREGADO, que precisa saber qual periodo esta
 *     aberto para lancar o ponto da equipe.
 *
 * O FINANCEIRO nao lanca nem confere ponto e por isso nao entra em nenhuma
 * destas rotas.
 */
@ApiTags('Ponto - periodos')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Sessao nao autenticada' })
@ApiForbiddenResponse({ description: 'Perfil sem permissao' })
@Controller('ponto/periodos')
export class PeriodosController {
  constructor(
    private readonly periodos: PeriodosService,
    private readonly envioRh: EnvioRhService,
  ) {}

  @Get()
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @ApiOperation({ summary: 'Lista os periodos de apuracao (RF-013)' })
  @ApiOkResponse({ description: 'Pagina de periodos, do mais recente para o mais antigo' })
  listar(@Query() query: ListarPeriodosQuery): Promise<RespostaPaginada<PeriodoResponse>> {
    return this.periodos.listar(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({
    summary: 'Abre a competencia e gera os dias de ponto (RF-013)',
    description:
      'O periodo vai do dia 1 ao ultimo dia do mes (RN-01) e nasce ABERTO. Gera um dia ' +
      'por funcionario com vinculo vigente, respeitando admissao, desligamento (RN-12) e ' +
      'a vigencia do vinculo.',
  })
  @ApiCreatedResponse({ description: 'Periodo aberto com os dias gerados' })
  @ApiBadRequestResponse({ description: 'Competencia invalida' })
  @ApiConflictResponse({ description: 'Competencia ja aberta' })
  abrir(@Body() dto: AbrirPeriodoDto): Promise<GerarDiasResponse> {
    return this.periodos.abrir(dto);
  }

  @Get(':id')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @ApiOperation({ summary: 'Detalha um periodo (RF-013)' })
  @ApiOkResponse({ description: 'Periodo' })
  @ApiNotFoundResponse({ description: 'Periodo nao encontrado' })
  buscar(@Param('id', ParseUUIDPipe) id: string): Promise<PeriodoResponse> {
    return this.periodos.buscar(id);
  }

  @Post(':id/dias')
  @HttpCode(HttpStatus.OK)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({
    summary: 'Gera os dias que faltam no periodo (RF-013)',
    description:
      'Usado depois de admitir ou vincular alguem com o periodo ja aberto. E idempotente: ' +
      'nao recria nem apaga dia que ja existe.',
  })
  @ApiOkResponse({ description: 'Quantos dias foram criados agora' })
  @ApiNotFoundResponse({ description: 'Periodo nao encontrado' })
  gerarDias(@Param('id', ParseUUIDPipe) id: string): Promise<GerarDiasResponse> {
    return this.periodos.gerarDias(id);
  }

  // -------------------------------------------------------------------------
  // T-041 / RF-018 - envio do periodo da equipe ao RH
  // -------------------------------------------------------------------------

  @Get(':id/resumo-envio')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @ApiOperation({
    summary: 'Resumo do que falta na equipe antes do envio ao RH (RF-018)',
    description:
      'Dias sem lancamento e dias com marcacao incompleta da equipe daquela obra no ' +
      'periodo, mais quantos dias ja foram enviados. O encarregado ve somente as obras ' +
      'dele (RN-05).',
  })
  @ApiOkResponse({ description: 'Resumo da equipe no periodo' })
  @ApiNotFoundResponse({ description: 'Periodo ou obra nao encontrados, ou obra fora do escopo' })
  resumoEnvio(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResumoEnvioQuery,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<ResumoEnvioRhResponse> {
    return this.envioRh.resumo(id, query.obraId, usuario);
  }

  @Post(':id/envio-rh')
  @HttpCode(HttpStatus.OK)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @Auditar({ acao: AcaoAuditoria.PERIODO_ENVIADO_RH, entidade: 'periodo' })
  @ApiOperation({
    summary: 'Envia o periodo da equipe para conferencia do RH (RF-018)',
    description:
      'Marca os dias da equipe daquela obra como enviados; a partir dai o encarregado nao ' +
      'altera mais esses dias (RN-06). Quando nao sobra nenhum dia pendente, o periodo ' +
      'passa a EM_CONFERENCIA. E idempotente: repetir a chamada nao reenvia o que ja foi ' +
      'enviado. Acao auditada (RF-005).',
  })
  @ApiOkResponse({ description: 'Dias enviados e situacao do periodo' })
  @ApiConflictResponse({ description: 'Periodo fechado ou ja enviado ao RH' })
  @ApiNotFoundResponse({ description: 'Periodo ou obra nao encontrados, ou obra fora do escopo' })
  enviarAoRh(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EnviarPeriodoRhDto,
    @UsuarioAtual() usuario: UsuarioRequisicao,
    @Req() requisicao: Request,
  ): Promise<EnviarPeriodoRhResponse> {
    return this.envioRh.enviar(id, dto.obraId, usuario, coletorDe(requisicao));
  }

  // -------------------------------------------------------------------------
  // T-043 / RF-020 - recalculo da apuracao
  // -------------------------------------------------------------------------

  @Post(':id/apuracao')
  @HttpCode(HttpStatus.OK)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({
    summary: 'Recalcula os totais do periodo (RF-020)',
    description:
      'O dia e apurado automaticamente a cada lancamento, ajuste e importacao. Este ' +
      'endpoint existe para quando muda algo de fora do dia: feriado cadastrado depois, ' +
      'jornada corrigida ou vinculo acertado. Nao altera marcacao nem ocorrencia.',
  })
  @ApiOkResponse({ description: 'Dias recalculados e totais do periodo' })
  @ApiNotFoundResponse({ description: 'Periodo nao encontrado' })
  apurar(@Param('id', ParseUUIDPipe) id: string): Promise<ApurarPeriodoResponse> {
    return this.periodos.apurar(id);
  }
}
