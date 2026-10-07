import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AcaoAuditoria,
  PERFIS_USUARIO,
  type SessaoResponse,
  type UsuarioAutenticado,
} from '@sistema/shared';
import type { Request, Response } from 'express';
import { Auditar } from '../common/auditoria/auditoria.decorator';
import { coletorDe } from '../common/auditoria/coletor-auditoria';
import { AppConfig } from '../config/app.config';
import { AuthService } from './auth.service';
import { Perfis } from './decorators/perfis.decorator';
import { Publico } from './decorators/publico.decorator';
import { UsuarioAtual } from './decorators/usuario-atual.decorator';
import { LoginDto } from './dto/login.dto';
import { TrocarSenhaDto } from './dto/trocar-senha.dto';
import { OrigemMesmaSiteGuard } from './guards/origem-mesma-site.guard';
import { origemDa } from './origem-requisicao';
import { definirCookieRefresh, lerCookieRefresh, limparCookieRefresh } from './refresh-cookie';
import type { UsuarioRequisicao } from './tipos';

/** Rate limit estrito nas rotas de sessao: freia forca bruta e enxurrada de refresh. */
const LIMITE_SESSAO = { default: { limit: 8, ttl: 60_000 } };

@ApiTags('Autenticacao')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Post('login')
  @Publico()
  @Throttle(LIMITE_SESSAO)
  @HttpCode(HttpStatus.OK)
  @Auditar({ acao: AcaoAuditoria.LOGIN, entidade: 'usuario' })
  @ApiOperation({
    summary: 'Autentica por e-mail e senha (RF-001)',
    description:
      'Devolve o access token no corpo e o refresh token em cookie httpOnly. ' +
      'O funcionario nao e usuario do sistema e nao possui login.',
  })
  @ApiOkResponse({ description: 'Sessao criada' })
  @ApiUnauthorizedResponse({ description: 'E-mail ou senha invalidos' })
  @ApiTooManyRequestsResponse({ description: 'Excesso de tentativas' })
  async login(
    @Body() dto: LoginDto,
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<SessaoResponse> {
    const { sessao, refreshToken } = await this.auth.login(
      dto,
      origemDa(requisicao),
      coletorDe(requisicao),
    );

    this.gravarCookie(resposta, refreshToken);
    return sessao;
  }

  @Post('refresh')
  @Publico()
  @UseGuards(OrigemMesmaSiteGuard)
  @Throttle(LIMITE_SESSAO)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Renova a sessao a partir do cookie de refresh (RF-001)',
    description:
      'Rotaciona o refresh token: o anterior e revogado. Reapresentar um token ja ' +
      'usado revoga todas as sessoes do usuario.',
  })
  @ApiOkResponse({ description: 'Sessao renovada' })
  @ApiUnauthorizedResponse({ description: 'Sessao expirada ou invalida' })
  async refresh(
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<SessaoResponse> {
    const token = lerCookieRefresh(requisicao.cookies);

    try {
      const { sessao, refreshToken } = await this.auth.refresh(token, origemDa(requisicao));
      this.gravarCookie(resposta, refreshToken);
      return sessao;
    } catch (erro) {
      // Cookie invalido nao fica no navegador tentando de novo.
      limparCookieRefresh(resposta, this.config.producao);
      throw erro;
    }
  }

  @Post('logout')
  @Perfis(...PERFIS_USUARIO)
  @UseGuards(OrigemMesmaSiteGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Encerra a sessao atual',
    description: 'Revoga a sessao no servidor e apaga o cookie de refresh.',
  })
  @ApiNoContentResponse({ description: 'Sessao encerrada' })
  async logout(
    @UsuarioAtual() usuario: UsuarioRequisicao,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<void> {
    await this.auth.logout(usuario.sessaoId);
    limparCookieRefresh(resposta, this.config.producao);
  }

  @Get('eu')
  @Perfis(...PERFIS_USUARIO)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Dados do usuario autenticado' })
  @ApiOkResponse({ description: 'Usuario autenticado' })
  @ApiUnauthorizedResponse({ description: 'Sessao nao autenticada' })
  eu(@UsuarioAtual() usuario: UsuarioRequisicao): Promise<UsuarioAutenticado> {
    return this.auth.usuarioAutenticado(usuario.id);
  }

  @Patch('senha')
  @Perfis(...PERFIS_USUARIO)
  @Throttle(LIMITE_SESSAO)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auditar({ acao: AcaoAuditoria.SENHA_REDEFINIDA, entidade: 'usuario' })
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Troca a propria senha (RF-004)',
    description: 'Exige a senha atual e encerra todas as sessoes abertas do usuario.',
  })
  @ApiNoContentResponse({ description: 'Senha alterada' })
  @ApiUnauthorizedResponse({ description: 'Senha atual incorreta' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao' })
  async trocarSenha(
    @UsuarioAtual() usuario: UsuarioRequisicao,
    @Body() dto: TrocarSenhaDto,
    @Req() requisicao: Request,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<void> {
    await this.auth.trocarSenha(usuario.id, dto, coletorDe(requisicao));
    limparCookieRefresh(resposta, this.config.producao);
  }

  private gravarCookie(resposta: Response, refreshToken: string): void {
    definirCookieRefresh(
      resposta,
      refreshToken,
      this.config.jwtRefreshTtlDias,
      this.config.producao,
    );
  }
}
