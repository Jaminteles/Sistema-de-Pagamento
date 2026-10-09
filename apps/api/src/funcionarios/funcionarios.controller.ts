import {
  BadRequestException,
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
  type DadosPagamentoResponse,
  type FuncionarioResponse,
  IMPORTACAO_FUNCIONARIOS_EXTENSOES,
  IMPORTACAO_FUNCIONARIOS_TAMANHO_MAXIMO_BYTES,
  type ImportarFuncionariosResponse,
  PerfilUsuario,
  type RespostaPaginada,
  type VinculoFuncionarioResponse,
} from '@sistema/shared';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Perfis } from '../auth/decorators/perfis.decorator';
import { UsuarioAtual } from '../auth/decorators/usuario-atual.decorator';
import type { UsuarioRequisicao } from '../auth/tipos';
import { Auditar } from '../common/auditoria/auditoria.decorator';
import { coletorDe } from '../common/auditoria/coletor-auditoria';
import { DadosPagamentoService } from './dados-pagamento.service';
import { AtualizarFuncionarioDto } from './dto/atualizar-funcionario.dto';
import { AtualizarVinculoDto } from './dto/atualizar-vinculo.dto';
import { CriarFuncionarioDto } from './dto/criar-funcionario.dto';
import { CriarVinculoDto } from './dto/criar-vinculo.dto';
import { DefinirDadosPagamentoDto } from './dto/definir-dados-pagamento.dto';
import { ListarFuncionariosQuery } from './dto/listar-funcionarios.query';
import { FuncionariosService } from './funcionarios.service';
import type { ArquivoEnviado } from './importacao/arquivo-enviado';
import { ImportacaoFuncionariosService } from './importacao-funcionarios.service';
import { VinculosService } from './vinculos.service';

/** Rate limit da importacao: planilha grande e operacao cara, nao de repeticao. */
const LIMITE_IMPORTACAO = { default: { limit: 10, ttl: 60_000 } };

/** Multer em memoria, com teto de tamanho aplicado antes de o arquivo chegar ao service. */
const OPCOES_UPLOAD = {
  limits: { fileSize: IMPORTACAO_FUNCIONARIOS_TAMANHO_MAXIMO_BYTES, files: 1 },
};

const CORPO_UPLOAD: ApiBodyOptions = {
  schema: {
    type: 'object',
    required: ['arquivo'],
    properties: {
      arquivo: {
        type: 'string',
        format: 'binary',
        description: `Planilha ${IMPORTACAO_FUNCIONARIOS_EXTENSOES.join(' ou ')}`,
      },
    },
  },
};

/**
 * Funcionarios (RF-006), dados de pagamento (RF-007), vinculo com obra e
 * jornada (RF-010) e importacao por planilha (RF-012).
 *
 * Perfis, conforme a matriz da secao 3 do Levantamento de Requisitos:
 *   - cadastrar e alterar: ADMIN e RH;
 *   - consultar: ADMIN, RH, FINANCEIRO e ENCARREGADO (so quem tem vinculo com
 *     as obras dele, RN-05 - recorte aplicado no service a partir do usuario
 *     autenticado, nunca de parametro da requisicao);
 *   - ver dados bancarios: ADMIN, RH e FINANCEIRO. Para os demais a resposta
 *     sai mascarada (RNF-05).
 *
 * O funcionario nao e usuario: nao existe aqui rota publica, login nem
 * autoatendimento.
 */
@ApiTags('Funcionarios')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Sessao nao autenticada' })
@ApiForbiddenResponse({ description: 'Perfil sem permissao' })
@Controller('funcionarios')
export class FuncionariosController {
  constructor(
    private readonly funcionarios: FuncionariosService,
    private readonly dadosPagamento: DadosPagamentoService,
    private readonly vinculos: VinculosService,
    private readonly importacao: ImportacaoFuncionariosService,
  ) {}

  @Get()
  @Perfis(
    PerfilUsuario.ADMIN,
    PerfilUsuario.RH,
    PerfilUsuario.FINANCEIRO,
    PerfilUsuario.ENCARREGADO,
  )
  @ApiOperation({
    summary: 'Lista funcionarios com busca, filtros e paginacao (RF-006)',
    description:
      'O encarregado recebe somente os funcionarios vinculados as obras dele (RN-05). ' +
      'CPF vem mascarado para perfil sem permissao (RNF-05).',
  })
  @ApiOkResponse({ description: 'Pagina de funcionarios' })
  listar(
    @Query() query: ListarFuncionariosQuery,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<RespostaPaginada<FuncionarioResponse>> {
    return this.funcionarios.listar(query, usuario);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({ summary: 'Cadastra funcionario (RF-006)' })
  @ApiCreatedResponse({ description: 'Funcionario criado' })
  @ApiBadRequestResponse({ description: 'CPF ou dados invalidos' })
  @ApiConflictResponse({ description: 'CPF ou matricula ja cadastrados' })
  criar(
    @Body() dto: CriarFuncionarioDto,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<FuncionarioResponse> {
    return this.funcionarios.criar(dto, usuario);
  }

  @Post('importacao/previa')
  @HttpCode(HttpStatus.OK)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @Throttle(LIMITE_IMPORTACAO)
  @UseInterceptors(FileInterceptor('arquivo', OPCOES_UPLOAD))
  @ApiConsumes('multipart/form-data')
  @ApiBody(CORPO_UPLOAD)
  @ApiOperation({
    summary: 'Pre-visualiza a importacao de funcionarios, sem gravar (RF-012)',
    description: 'Mesma validacao da importacao. Nada e gravado no banco.',
  })
  @ApiOkResponse({ description: 'Relatorio da previa' })
  @ApiBadRequestResponse({ description: 'Arquivo ausente, invalido ou acima do limite' })
  previaImportacao(
    @UploadedFile() arquivo: ArquivoEnviado | undefined,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<ImportarFuncionariosResponse> {
    return this.importacao.importar(this.exigirArquivo(arquivo), usuario, true);
  }

  @Post('importacao')
  @HttpCode(HttpStatus.OK)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @Throttle(LIMITE_IMPORTACAO)
  @UseInterceptors(FileInterceptor('arquivo', OPCOES_UPLOAD))
  @ApiConsumes('multipart/form-data')
  @ApiBody(CORPO_UPLOAD)
  @ApiOperation({
    summary: 'Importa funcionarios por planilha (RF-012)',
    description:
      'Grava apenas as linhas sem erro, numa transacao. Quem ja existe por CPF ou ' +
      'matricula e ignorado; o relatorio aponta linha, campo e motivo de cada recusa.',
  })
  @ApiOkResponse({ description: 'Relatorio da importacao' })
  @ApiBadRequestResponse({ description: 'Arquivo ausente, invalido ou acima do limite' })
  importar(
    @UploadedFile() arquivo: ArquivoEnviado | undefined,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<ImportarFuncionariosResponse> {
    return this.importacao.importar(this.exigirArquivo(arquivo), usuario, false);
  }

  @Get(':id')
  @Perfis(
    PerfilUsuario.ADMIN,
    PerfilUsuario.RH,
    PerfilUsuario.FINANCEIRO,
    PerfilUsuario.ENCARREGADO,
  )
  @ApiOperation({
    summary: 'Detalha um funcionario (RF-006)',
    description:
      'Funcionario fora do escopo do encarregado responde 404, para nao confirmar a ' +
      'existencia do cadastro pelo id da rota.',
  })
  @ApiOkResponse({ description: 'Funcionario' })
  @ApiNotFoundResponse({ description: 'Funcionario nao encontrado' })
  buscar(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<FuncionarioResponse> {
    return this.funcionarios.buscar(id, usuario);
  }

  @Patch(':id')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({
    summary: 'Altera funcionario (RF-006)',
    description:
      'O CPF nao e alteravel. Desligar exige a data de desligamento; o cadastro ' +
      'continua visivel nos periodos anteriores (RN-12).',
  })
  @ApiOkResponse({ description: 'Funcionario atualizado' })
  @ApiBadRequestResponse({ description: 'Alteracao nao permitida' })
  @ApiConflictResponse({ description: 'Matricula ja cadastrada' })
  @ApiNotFoundResponse({ description: 'Funcionario nao encontrado' })
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarFuncionarioDto,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<FuncionarioResponse> {
    return this.funcionarios.atualizar(id, dto, usuario);
  }

  @Get(':id/dados-pagamento')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH, PerfilUsuario.FINANCEIRO)
  @ApiOperation({
    summary: 'Dados de pagamento do funcionario (RF-007)',
    description:
      'Chave Pix e conta ficam criptografadas em repouso (RNF-04) e voltam em claro ' +
      'somente para os perfis autorizados a ver dados bancarios; os demais recebem ' +
      'apenas a mascara (RNF-05).',
  })
  @ApiOkResponse({ description: 'Dados de pagamento' })
  @ApiNotFoundResponse({ description: 'Funcionario nao encontrado' })
  buscarDadosPagamento(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<DadosPagamentoResponse> {
    return this.dadosPagamento.buscar(id, usuario);
  }

  @Put(':id/dados-pagamento')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @Auditar({ acao: AcaoAuditoria.FUNCIONARIO_DADOS_PAGAMENTO_ALTERADO, entidade: 'funcionario' })
  @ApiOperation({
    summary: 'Define os dados de pagamento do funcionario (RF-007)',
    description:
      'Substitui o cadastro inteiro. Corpo com todos os campos nulos limpa os dados, ' +
      'e o funcionario deixa de entrar em lote (RN-08). Acao auditada (RF-005), sem ' +
      'gravar chave, conta ou CPF no log.',
  })
  @ApiOkResponse({ description: 'Dados de pagamento atualizados' })
  @ApiBadRequestResponse({ description: 'Chave Pix ou dados de conta invalidos' })
  @ApiNotFoundResponse({ description: 'Funcionario nao encontrado' })
  definirDadosPagamento(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DefinirDadosPagamentoDto,
    @UsuarioAtual() usuario: UsuarioRequisicao,
    @Req() requisicao: Request,
  ): Promise<DadosPagamentoResponse> {
    return this.dadosPagamento.definir(id, dto, usuario, coletorDe(requisicao));
  }

  @Get(':id/vinculos')
  @Perfis(
    PerfilUsuario.ADMIN,
    PerfilUsuario.RH,
    PerfilUsuario.FINANCEIRO,
    PerfilUsuario.ENCARREGADO,
  )
  @ApiOperation({ summary: 'Vinculos do funcionario com obra e jornada (RF-010)' })
  @ApiOkResponse({ description: 'Vinculos, do mais recente para o mais antigo' })
  @ApiNotFoundResponse({ description: 'Funcionario nao encontrado' })
  listarVinculos(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<VinculoFuncionarioResponse[]> {
    return this.vinculos.listar(id, usuario);
  }

  @Post(':id/vinculos')
  @HttpCode(HttpStatus.CREATED)
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({
    summary: 'Vincula o funcionario a uma obra e jornada com vigencia (RF-010)',
    description:
      'As vigencias nao podem se sobrepor e so existe um vinculo aberto por ' +
      'funcionario: encerre o anterior antes de abrir outro.',
  })
  @ApiCreatedResponse({ description: 'Vinculo criado' })
  @ApiBadRequestResponse({ description: 'Obra, jornada ou vigencia invalidas' })
  @ApiConflictResponse({ description: 'Vigencia sobreposta a outro vinculo' })
  @ApiNotFoundResponse({ description: 'Funcionario nao encontrado' })
  criarVinculo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CriarVinculoDto,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<VinculoFuncionarioResponse> {
    return this.vinculos.criar(id, dto, usuario);
  }

  @Patch(':id/vinculos/:vinculoId')
  @Perfis(PerfilUsuario.ADMIN, PerfilUsuario.RH)
  @ApiOperation({
    summary: 'Altera um vinculo do funcionario (RF-010)',
    description: 'Uso mais comum: encerrar a vigencia informando `fimVigencia`.',
  })
  @ApiOkResponse({ description: 'Vinculo atualizado' })
  @ApiBadRequestResponse({ description: 'Obra, jornada ou vigencia invalidas' })
  @ApiConflictResponse({ description: 'Vigencia sobreposta a outro vinculo' })
  @ApiNotFoundResponse({ description: 'Funcionario ou vinculo nao encontrado' })
  atualizarVinculo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vinculoId', ParseUUIDPipe) vinculoId: string,
    @Body() dto: AtualizarVinculoDto,
    @UsuarioAtual() usuario: UsuarioRequisicao,
  ): Promise<VinculoFuncionarioResponse> {
    return this.vinculos.atualizar(id, vinculoId, dto, usuario);
  }

  /** Multer deixa o campo vazio quando nenhum arquivo e enviado. */
  private exigirArquivo(arquivo: ArquivoEnviado | undefined): ArquivoEnviado {
    if (!arquivo) {
      throw new BadRequestException('Envie a planilha no campo "arquivo".');
    }
    return arquivo;
  }
}
