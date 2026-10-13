import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  type ApiBodyOptions,
  ApiConflictResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AcaoAuditoria,
  type AjustarDiaResponse,
  type AjustePontoResponse,
  type GradeEquipeResponse,
  IMPORTACAO_MARCACOES_EXTENSOES,
  IMPORTACAO_MARCACOES_TAMANHO_MAXIMO_BYTES,
  type ImportarMarcacoesResponse,
  type LancarPontoResponse,
  PerfilUsuario,
  type PontoFuncionarioResponse,
} from '@sistema/shared';
import type { Request } from 'express';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import type { UsuarioRequisicao } from '../auth/tipos';
import { Auditar } from '../common/auditoria/auditoria.decorator';
import { coletorDe } from '../common/auditoria/coletor-auditoria';
import type { ArquivoEnviado } from '../funcionarios/importacao/arquivo-enviado';
import { AjusteService } from './ajuste.service';
import { AjustarDiaDto } from './dto/ajustar-dia.dto';
import { GradeQuery } from './dto/grade.query';
import { IntervaloQuery } from './dto/intervalo.query';
import { LancarEquipeDto } from './dto/lancar-equipe.dto';
import { LancarFuncionarioDto } from './dto/lancar-funcionario.dto';
import { ImportacaoMarcacoesService } from './importacao-marcacoes.service';
import { PontoService } from './ponto.service';

/** Rate limit da importacao: arquivo grande e operacao cara, nao de repeticao. */
const LIMITE_IMPORTACAO = { default: { limit: 10, ttl: 60_000 } };

/** Multer em memoria, com teto de tamanho aplicado antes de o arquivo chegar ao service. */
const OPCOES_UPLOAD = {
  limits: { fileSize: IMPORTACAO_MARCACOES_TAMANHO_MAXIMO_BYTES, files: 1 },
};

const CORPO_UPLOAD: ApiBodyOptions = {
  schema: {
    type: 'object',
    required: ['arquivo'],
    properties: {
      arquivo: {
        type: 'string',
        format: 'binary',
        description:
          `Arquivo ${IMPORTACAO_MARCACOES_EXTENSOES.join(' ou ')} com uma linha por dia: ` +
          'matricula (ou cpf), data, entrada, saida_intervalo, retorno_intervalo, saida',
      },
    },
  },
};

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
  constructor(
    private readonly ponto: PontoService,
    private readonly ajuste: AjusteService,
    private readonly importacao: ImportacaoMarcacoesService,
  ) {}

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

  // -------------------------------------------------------------------------
  // T-040 / RF-017 - ajuste com justificativa e historico
  // -------------------------------------------------------------------------

  @Put('dias/:diaPontoId/ajuste')
  @HttpCode(HttpStatus.OK)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @Auditar({
    acao: AcaoAuditoria.PONTO_AJUSTADO,
    entidade: 'dia_ponto',
    parametroId: 'diaPontoId',
  })
  @ApiOperation({
    summary: 'Ajusta um dia ja lancado, com justificativa (RF-017)',
    description:
      'Grava a correcao e registra no historico o que mudou, campo a campo, com a ' +
      'justificativa e o autor. Ao contrario do lancamento em lote, aqui ou o dia inteiro ' +
      'e aceito ou a chamada falha. O encarregado so ajusta antes do envio ao RH (RN-06) e ' +
      'apenas na equipe dele (RN-05); periodo fechado nao aceita ajuste (RN-07). Acao ' +
      'auditada (RF-005).',
  })
  @ApiOkResponse({ description: 'Dia ajustado, reapurado, com a linha do tempo' })
  @ApiBadRequestResponse({ description: 'Justificativa ausente, marcacao invalida ou nada mudou' })
  @ApiConflictResponse({ description: 'Periodo fechado ou ja enviado ao RH' })
  @ApiNotFoundResponse({ description: 'Dia nao encontrado ou fora do escopo' })
  ajustar(
    @Param('diaPontoId', ParseUUIDPipe) diaPontoId: string,
    @Body() dto: AjustarDiaDto,
    @UsuarioAtual() usuario: UsuarioRequisicao,
    @Req() requisicao: Request,
  ): Promise<AjustarDiaResponse> {
    return this.ajuste.ajustar(diaPontoId, dto, usuario, coletorDe(requisicao));
  }

  @Get('dias/:diaPontoId/ajustes')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.ENCARREGADO)
  @ApiOperation({
    summary: 'Historico de ajustes de um dia (RF-017)',
    description: 'Do ajuste mais recente para o mais antigo, com autor e justificativa.',
  })
  @ApiOkResponse({ description: 'Linha do tempo do dia' })
  @ApiNotFoundResponse({ description: 'Dia nao encontrado ou fora do escopo' })
  historicoDeAjustes(
    @Param('diaPontoId', ParseUUIDPipe) diaPontoId: string,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<AjustePontoResponse[]> {
    return this.ajuste.historico(diaPontoId, usuario);
  }

  // -------------------------------------------------------------------------
  // T-042 / RF-019 - importacao de marcacoes por CSV
  // -------------------------------------------------------------------------

  @Post('marcacoes/importacao')
  @HttpCode(HttpStatus.OK)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @Throttle(LIMITE_IMPORTACAO)
  @UseInterceptors(FileInterceptor('arquivo', OPCOES_UPLOAD))
  @ApiConsumes('multipart/form-data')
  @ApiBody(CORPO_UPLOAD)
  @ApiOperation({
    summary: 'Importa marcacoes por CSV (RF-019)',
    description:
      'Uma linha por dia de cada funcionario, identificado por matricula ou CPF. As ' +
      'marcacoes passam pelas mesmas regras do lancamento manual - periodo aberto, vinculo ' +
      'na data, ocorrencia e validacao de horario - e ficam gravadas com origem IMPORTADO. ' +
      'Linha com erro nao e gravada e volta no relatorio com linha, campo e motivo.',
  })
  @ApiOkResponse({ description: 'Relatorio da importacao' })
  @ApiBadRequestResponse({
    description: 'Arquivo ausente, acima do limite ou com cabecalho invalido',
  })
  importarMarcacoes(
    @UploadedFile() arquivo: ArquivoEnviado | undefined,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<ImportarMarcacoesResponse> {
    if (!arquivo) {
      throw new BadRequestException('Envie o arquivo no campo "arquivo".');
    }
    return this.importacao.importar(arquivo, usuario);
  }
}
