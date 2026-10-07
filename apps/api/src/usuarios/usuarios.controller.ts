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
  Req,
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
  AcaoAuditoria,
  PerfilUsuario,
  type RespostaPaginada,
  type UsuarioResponse,
} from '@sistema/shared';
import type { Request } from 'express';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import type { UsuarioRequisicao } from '../auth/tipos';
import { Auditar } from '../common/auditoria/auditoria.decorator';
import { coletorDe } from '../common/auditoria/coletor-auditoria';
import { AtualizarUsuarioDto } from './dto/atualizar-usuario.dto';
import { CriarUsuarioDto } from './dto/criar-usuario.dto';
import { ListarUsuariosQuery } from './dto/listar-usuarios.query';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto';
import { UsuariosService } from './usuarios.service';

/**
 * Gestao de usuarios e perfis (RF-002, RF-004).
 *
 * Pela matriz da secao 3 do Levantamento de Requisitos, "gerenciar usuarios e
 * perfis" e exclusivo do ADMIN. O @Perfis aqui na classe vale para todos os
 * endpoints do controller.
 */
@ApiTags('Usuarios')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Sessao nao autenticada' })
@ApiForbiddenResponse({ description: 'Perfil sem permissao' })
@Perfis(PerfilUsuario.ADMIN)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @ApiOperation({ summary: 'Lista usuarios com busca, filtros e paginacao (RF-002)' })
  @ApiOkResponse({ description: 'Pagina de usuarios' })
  listar(@Query() query: ListarUsuariosQuery): Promise<RespostaPaginada<UsuarioResponse>> {
    return this.usuarios.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha um usuario (RF-002)' })
  @ApiOkResponse({ description: 'Usuario' })
  @ApiNotFoundResponse({ description: 'Usuario nao encontrado' })
  buscar(@Param('id', ParseUUIDPipe) id: string): Promise<UsuarioResponse> {
    return this.usuarios.buscar(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Auditar({ acao: AcaoAuditoria.USUARIO_CRIADO, entidade: 'usuario' })
  @ApiOperation({ summary: 'Cria usuario e atribui perfil (RF-002)' })
  @ApiCreatedResponse({ description: 'Usuario criado' })
  @ApiConflictResponse({ description: 'E-mail ja cadastrado' })
  criar(@Body() dto: CriarUsuarioDto, @Req() requisicao: Request): Promise<UsuarioResponse> {
    return this.usuarios.criar(dto, coletorDe(requisicao));
  }

  @Patch(':id')
  @Auditar({ acao: AcaoAuditoria.USUARIO_PERFIL_ALTERADO, entidade: 'usuario' })
  @ApiOperation({
    summary: 'Altera nome, perfil ou situacao do usuario (RF-002)',
    description:
      'Nao permite alterar o proprio perfil ou a propria situacao, nem deixar o ' +
      'sistema sem administrador ativo. Mudar o perfil ou desativar a conta ' +
      'encerra as sessoes abertas do usuario.',
  })
  @ApiOkResponse({ description: 'Usuario atualizado' })
  @ApiBadRequestResponse({ description: 'Alteracao nao permitida' })
  @ApiNotFoundResponse({ description: 'Usuario nao encontrado' })
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarUsuarioDto,
    @UsuarioAtual() autor: UsuarioRequisicao,
    @Req() requisicao: Request,
  ): Promise<UsuarioResponse> {
    return this.usuarios.atualizar(id, dto, autor.id, coletorDe(requisicao));
  }

  @Post(':id/redefinir-senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auditar({ acao: AcaoAuditoria.SENHA_REDEFINIDA, entidade: 'usuario' })
  @ApiOperation({
    summary: 'Redefine a senha de um usuario (RF-004)',
    description:
      'Encerra todas as sessoes abertas do usuario. A senha nao volta na resposta: ' +
      'o administrador a combina com o usuario por fora do sistema.',
  })
  @ApiNoContentResponse({ description: 'Senha redefinida' })
  @ApiNotFoundResponse({ description: 'Usuario nao encontrado' })
  redefinirSenha(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RedefinirSenhaDto,
    @Req() requisicao: Request,
  ): Promise<void> {
    return this.usuarios.redefinirSenha(id, dto, coletorDe(requisicao));
  }
}
