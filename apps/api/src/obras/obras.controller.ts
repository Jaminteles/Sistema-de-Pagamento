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
  Put,
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
  type EncarregadoObraResponse,
  type ObraResponse,
  PerfilUsuario,
  type RespostaPaginada,
} from '@sistema/shared';
import type { Request } from 'express';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import type { UsuarioRequisicao } from '../auth/tipos';
import { Auditar } from '../common/auditoria/auditoria.decorator';
import { coletorDe } from '../common/auditoria/coletor-auditoria';
import { AtualizarObraDto } from './dto/atualizar-obra.dto';
import { CriarObraDto } from './dto/criar-obra.dto';
import { DefinirEncarregadosDto } from './dto/definir-encarregados.dto';
import { ListarObrasQuery } from './dto/listar-obras.query';
import { ObrasService } from './obras.service';

/**
 * Obras/setores (RF-008) e vinculo de encarregados (RF-003).
 *
 * Perfis, conforme a matriz da secao 3 do Levantamento de Requisitos:
 *   - cadastrar e alterar obra: ADMIN e RH;
 *   - consultar obra: ADMIN, RH, FINANCEIRO e ENCARREGADO (so as obras dele,
 *     RN-05, recorte aplicado no service a partir do usuario autenticado);
 *   - vincular encarregado: ADMIN. RF-003 e requisito do modulo de acesso -
 *     o vinculo decide o que o encarregado passa a enxergar, e "gerenciar
 *     usuarios e perfis" e exclusivo do administrador.
 */
@ApiTags('Obras')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Sessao nao autenticada' })
@ApiForbiddenResponse({ description: 'Perfil sem permissao' })
@Controller('obras')
export class ObrasController {
  constructor(private readonly obras: ObrasService) {}

  @Get()
  @Perfis(
    PerfilUsuario.ADMIN,
    PerfilUsuario.RH,
    PerfilUsuario.FINANCEIRO,
    PerfilUsuario.ENCARREGADO,
  )
  @ApiOperation({
    summary: 'Lista obras/setores com busca, filtro e paginacao (RF-008)',
    description:
      'O encarregado recebe somente as obras vinculadas a ele (RN-05). O filtro ' +
      'sai do usuario autenticado, nunca de parametro da requisicao.',
  })
  @ApiOkResponse({ description: 'Pagina de obras' })
  listar(
    @Query() query: ListarObrasQuery,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<RespostaPaginada<ObraResponse>> {
    return this.obras.listar(query, usuario);
  }

  @Get(':id')
  @Perfis(
    PerfilUsuario.ADMIN,
    PerfilUsuario.RH,
    PerfilUsuario.FINANCEIRO,
    PerfilUsuario.ENCARREGADO,
  )
  @ApiOperation({
    summary: 'Detalha uma obra/setor (RF-008)',
    description:
      'Obra fora do escopo do encarregado responde 404, para nao confirmar a ' +
      'existencia do registro pelo id da rota.',
  })
  @ApiOkResponse({ description: 'Obra' })
  @ApiNotFoundResponse({ description: 'Obra nao encontrada' })
  buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<ObraResponse> {
    return this.obras.buscar(id, usuario);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({ summary: 'Cadastra obra/setor (RF-008)' })
  @ApiCreatedResponse({ description: 'Obra criada' })
  @ApiConflictResponse({ description: 'Nome ja cadastrado' })
  criar(@Body() dto: CriarObraDto): Promise<ObraResponse> {
    return this.obras.criar(dto);
  }

  @Patch(':id')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({
    summary: 'Altera nome, endereco ou situacao da obra (RF-008)',
    description:
      'Obra nao e excluida: desativar a tira das novas operacoes e preserva o historico.',
  })
  @ApiOkResponse({ description: 'Obra atualizada' })
  @ApiBadRequestResponse({ description: 'Alteracao nao permitida' })
  @ApiConflictResponse({ description: 'Nome ja cadastrado' })
  @ApiNotFoundResponse({ description: 'Obra nao encontrada' })
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarObraDto,
  ): Promise<ObraResponse> {
    return this.obras.atualizar(id, dto);
  }

  @Get(':id/encarregados')
  @Perfis(PerfilUsuario.ADMIN)
  @ApiOperation({ summary: 'Encarregados vinculados a obra (RF-003)' })
  @ApiOkResponse({ description: 'Encarregados da obra' })
  @ApiNotFoundResponse({ description: 'Obra nao encontrada' })
  listarEncarregados(@Param('id', ParseUUIDPipe) id: string): Promise<EncarregadoObraResponse[]> {
    return this.obras.listarEncarregados(id);
  }

  @Put(':id/encarregados')
  @Perfis(PerfilUsuario.ADMIN)
  @Auditar({ acao: AcaoAuditoria.OBRA_ENCARREGADOS_ALTERADOS, entidade: 'obra' })
  @ApiOperation({
    summary: 'Define os encarregados da obra (RF-003)',
    description:
      'Substitui a lista inteira; `[]` desvincula todos. Aceita apenas usuarios ' +
      'com perfil Encarregado. Acao auditada (RF-005).',
  })
  @ApiOkResponse({ description: 'Encarregados da obra' })
  @ApiBadRequestResponse({ description: 'Usuario inexistente ou sem perfil Encarregado' })
  @ApiNotFoundResponse({ description: 'Obra nao encontrada' })
  definirEncarregados(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DefinirEncarregadosDto,
    @Req() requisicao: Request,
  ): Promise<EncarregadoObraResponse[]> {
    return this.obras.definirEncarregados(id, dto, coletorDe(requisicao));
  }
}
