import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type GradeEquipeResponse,
  type LancarPontoResponse,
  PerfilUsuario,
  type PontoFuncionarioResponse,
} from '@sistema/shared';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import type { UsuarioRequisicao } from '../auth/tipos';
import { GradeQuery } from './dto/grade.query';
import { IntervaloQuery } from './dto/intervalo.query';
import { LancarEquipeDto } from './dto/lancar-equipe.dto';
import { LancarFuncionarioDto } from './dto/lancar-funcionario.dto';
import { PontoService } from './ponto.service';

/**
 * Lancamento de ponto (T-032 a T-035 / RF-013 a RF-016).
 *
 * Perfis, conforme a linha "Lancar ponto" da matriz da secao 3 do Levantamento
 * de Requisitos: ADMIN e RH em todas as obras, ENCARREGADO somente na equipe
 * dele (RN-05). O FINANCEIRO nao lanca nem consulta ponto.
 *
 * O recorte por obra sai do usuario autenticado, no service. Obra ou
 * funcionario fora do escopo respondem 404 - e nao 403 - para nao confirmar a
 * existencia do cadastro pelo id da rota.
 */
@ApiTags('Ponto - lancamento')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Sessao nao autenticada' })
@ApiForbiddenResponse({ description: 'Perfil sem permissao' })
@Controller('ponto')
export class PontoController {
  constructor(private readonly ponto: PontoService) {}

  @Get('grade')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @ApiOperation({
    summary: 'Grade de lancamento da equipe de uma obra num dia (RF-013)',
    description:
      'Traz a equipe com vinculo vigente na data, a jornada de cada um (para a tela ' +
      'oferecer o horario padrao), o periodo que cobre o dia e o feriado, quando houver.',
  })
  @ApiOkResponse({ description: 'Grade do dia' })
  @ApiBadRequestResponse({ description: 'Obra ou data invalidas' })
  @ApiNotFoundResponse({ description: 'Obra nao encontrada ou fora do escopo' })
  grade(
    @Query() query: GradeQuery,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<GradeEquipeResponse> {
    return this.ponto.grade(query, usuario);
  }

  @Put('grade')
  @HttpCode(HttpStatus.OK)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @ApiOperation({
    summary: 'Lanca o ponto da equipe em lote (RF-013 a RF-016)',
    description:
      'Grava numa unica transacao os dias sem erro e devolve, linha por linha, o motivo ' +
      'de cada recusa: periodo fechado (RN-07), periodo ja enviado ao RH (RN-06), ' +
      'funcionario sem vinculo na data, ocorrencia incompativel com horario (RF-015) e ' +
      'marcacao fora de ordem, sobreposta ou com intervalo menor que o da jornada (RF-016). ' +
      'Repetir a chamada nao duplica marcacao.',
  })
  @ApiOkResponse({ description: 'Dias gravados e erros por linha' })
  @ApiBadRequestResponse({ description: 'Corpo invalido' })
  @ApiNotFoundResponse({ description: 'Obra nao encontrada ou fora do escopo' })
  lancarEquipe(
    @Body() dto: LancarEquipeDto,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<LancarPontoResponse> {
    return this.ponto.lancarEquipe(dto, usuario);
  }

  @Get('funcionarios/:funcionarioId')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @ApiOperation({
    summary: 'Ponto de um funcionario no intervalo pedido (RF-014)',
    description:
      'A mesma rota atende a visao semanal e a mensal: muda apenas o intervalo. Traz os ' +
      'dias com marcacoes, a jornada vigente em cada dia, os feriados e os totais ja ' +
      'calculados pela apuracao.',
  })
  @ApiOkResponse({ description: 'Dias do funcionario no intervalo' })
  @ApiBadRequestResponse({ description: 'Intervalo invalido ou acima do limite' })
  @ApiNotFoundResponse({ description: 'Funcionario nao encontrado ou fora do escopo' })
  porFuncionario(
    @Param('funcionarioId', ParseUUIDPipe) funcionarioId: string,
    @Query() query: IntervaloQuery,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<PontoFuncionarioResponse> {
    return this.ponto.porFuncionario(funcionarioId, query, usuario);
  }

  @Put('funcionarios/:funcionarioId/dias')
  @HttpCode(HttpStatus.OK)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @ApiOperation({
    summary: 'Lanca varios dias de um funcionario (RF-014 a RF-016)',
    description:
      'Mesmas regras do lancamento em lote da grade. O funcionario vem do parametro de ' +
      'rota, nunca do corpo.',
  })
  @ApiOkResponse({ description: 'Dias gravados e erros por dia' })
  @ApiBadRequestResponse({ description: 'Corpo invalido' })
  @ApiNotFoundResponse({ description: 'Funcionario nao encontrado ou fora do escopo' })
  lancarFuncionario(
    @Param('funcionarioId', ParseUUIDPipe) funcionarioId: string,
    @Body() dto: LancarFuncionarioDto,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<LancarPontoResponse> {
    return this.ponto.lancarFuncionario(funcionarioId, dto, usuario);
  }
}
