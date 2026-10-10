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
  type GerarDiasResponse,
  type PeriodoResponse,
  PerfilUsuario,
  type RespostaPaginada,
} from '@sistema/shared';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { AbrirPeriodoDto } from './dto/abrir-periodo.dto';
import { ListarPeriodosQuery } from './dto/listar-periodos.query';
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
  constructor(private readonly periodos: PeriodosService) {}

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
}
