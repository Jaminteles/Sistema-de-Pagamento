import {
  Body,
  Controller,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type JornadaResponse, PerfilUsuario, type RespostaPaginada } from '@sistema/shared';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { AtualizarJornadaDto } from './dto/atualizar-jornada.dto';
import { CriarJornadaDto } from './dto/criar-jornada.dto';
import { ListarJornadasQuery } from './dto/listar-jornadas.query';
import { JornadasService } from './jornadas.service';

/**
 * Cadastro de jornadas (RF-009).
 *
 * Pela matriz da secao 3 do Levantamento de Requisitos, "cadastrar
 * funcionarios, obras, jornadas e feriados" e de ADMIN e RH - inclusive a
 * consulta, ja que jornada e cadastro de apoio do RH. O @Perfis da classe vale
 * para todos os endpoints.
 */
@ApiTags('Jornadas')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Sessao nao autenticada' })
@ApiForbiddenResponse({ description: 'Perfil sem permissao' })
@Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
@Controller('jornadas')
export class JornadasController {
  constructor(private readonly jornadas: JornadasService) {}

  @Get()
  @ApiOperation({ summary: 'Lista jornadas com busca, filtro e paginacao (RF-009)' })
  @ApiOkResponse({ description: 'Pagina de jornadas' })
  listar(@Query() query: ListarJornadasQuery): Promise<RespostaPaginada<JornadaResponse>> {
    return this.jornadas.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha uma jornada (RF-009)' })
  @ApiOkResponse({ description: 'Jornada' })
  @ApiNotFoundResponse({ description: 'Jornada nao encontrada' })
  buscar(@Param('id', ParseUUIDPipe) id: string): Promise<JornadaResponse> {
    return this.jornadas.buscar(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Cadastra jornada (RF-009)',
    description:
      'Horarios em minutos desde a meia-noite. Saida menor que a entrada indica ' +
      'virada de dia (turno da noite).',
  })
  @ApiCreatedResponse({ description: 'Jornada criada' })
  @ApiBadRequestResponse({ description: 'Horarios inconsistentes' })
  @ApiConflictResponse({ description: 'Nome ja cadastrado' })
  criar(@Body() dto: CriarJornadaDto): Promise<JornadaResponse> {
    return this.jornadas.criar(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Altera uma jornada (RF-009)',
    description:
      'Jornada nao e excluida: desativar a tira dos novos vinculos e preserva os ' +
      'periodos ja apurados por ela.',
  })
  @ApiOkResponse({ description: 'Jornada atualizada' })
  @ApiBadRequestResponse({ description: 'Alteracao nao permitida' })
  @ApiConflictResponse({ description: 'Nome ja cadastrado' })
  @ApiNotFoundResponse({ description: 'Jornada nao encontrada' })
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarJornadaDto,
  ): Promise<JornadaResponse> {
    return this.jornadas.atualizar(id, dto);
  }
}
