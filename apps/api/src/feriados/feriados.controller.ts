import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type CarregarFeriadosNacionaisResponse,
  type FeriadoResponse,
  PerfilUsuario,
} from '@sistema/shared';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { AtualizarFeriadoDto } from './dto/atualizar-feriado.dto';
import { CarregarFeriadosNacionaisDto } from './dto/carregar-feriados-nacionais.dto';
import { CriarFeriadoDto } from './dto/criar-feriado.dto';
import { ListarFeriadosQuery } from './dto/listar-feriados.query';
import { FeriadosService } from './feriados.service';

/**
 * Calendario de feriados (RF-011).
 *
 * Cadastrar e de ADMIN e RH (matriz da secao 3). A leitura inclui o
 * ENCARREGADO: o calendario orienta o lancamento de ponto na obra e nao contem
 * dado pessoal.
 */
@ApiTags('Feriados')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Sessao nao autenticada' })
@ApiForbiddenResponse({ description: 'Perfil sem permissao' })
@Controller('feriados')
export class FeriadosController {
  constructor(private readonly feriados: FeriadosService) {}

  @Get()
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @ApiOperation({
    summary: 'Lista os feriados de um ano (RF-011)',
    description: 'Sem o parametro `ano`, usa o ano corrente no fuso America/Bahia (RNF-12).',
  })
  @ApiOkResponse({ description: 'Feriados do ano, ordenados por data' })
  listar(@Query() query: ListarFeriadosQuery): Promise<FeriadoResponse[]> {
    return this.feriados.listar(query);
  }

  @Get(':id')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @ApiOperation({ summary: 'Detalha um feriado (RF-011)' })
  @ApiOkResponse({ description: 'Feriado' })
  @ApiNotFoundResponse({ description: 'Feriado nao encontrado' })
  buscar(@Param('id', ParseUUIDPipe) id: string): Promise<FeriadoResponse> {
    return this.feriados.buscar(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({ summary: 'Cadastra feriado (RF-011)' })
  @ApiCreatedResponse({ description: 'Feriado criado' })
  @ApiBadRequestResponse({ description: 'Abrangencia, UF e municipio incoerentes' })
  @ApiConflictResponse({ description: 'Feriado ja cadastrado nesta data' })
  criar(@Body() dto: CriarFeriadoDto): Promise<FeriadoResponse> {
    return this.feriados.criar(dto);
  }

  @Post('nacionais')
  @HttpCode(HttpStatus.OK)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({
    summary: 'Carga inicial dos feriados nacionais do ano (RF-011)',
    description:
      'Idempotente: repetir a carga nao duplica nem sobrescreve ajustes do RH. ' +
      'Carnaval e Corpus Christi nao entram - sao ponto facultativo, e nao ' +
      'feriado nacional; quem observa esses dias cadastra manualmente.',
  })
  @ApiOkResponse({ description: 'Resumo da carga e feriados nacionais do ano' })
  carregarNacionais(
    @Body() dto: CarregarFeriadosNacionaisDto,
  ): Promise<CarregarFeriadosNacionaisResponse> {
    return this.feriados.carregarNacionais(dto);
  }

  @Patch(':id')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({ summary: 'Altera um feriado (RF-011)' })
  @ApiOkResponse({ description: 'Feriado atualizado' })
  @ApiBadRequestResponse({ description: 'Alteracao nao permitida' })
  @ApiConflictResponse({ description: 'Feriado ja cadastrado nesta data' })
  @ApiNotFoundResponse({ description: 'Feriado nao encontrado' })
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarFeriadoDto,
  ): Promise<FeriadoResponse> {
    return this.feriados.atualizar(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({
    summary: 'Remove um feriado (RF-011)',
    description:
      'Feriado nao e referenciado por ponto nem por pagamento: a remocao e ' +
      'direta, ao contrario de obra e jornada, que sao desativadas.',
  })
  @ApiNoContentResponse({ description: 'Feriado removido' })
  @ApiNotFoundResponse({ description: 'Feriado nao encontrado' })
  remover(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.feriados.remover(id);
  }
}
