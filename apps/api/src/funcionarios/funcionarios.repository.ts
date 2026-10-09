import { Injectable } from '@nestjs/common';
import type { SituacaoFuncionario, TipoChavePix } from '@sistema/shared';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Vinculo com os nomes de obra e jornada ja resolvidos.
 *
 * O nome vem no mesmo `select` da consulta do funcionario: a tela mostra "Obra
 * Centro - Comercial" sem uma requisicao por linha (nada de N+1).
 */
export interface VinculoRegistro {
  id: string;
  funcionarioId: string;
  obraId: string;
  obraNome: string;
  jornadaId: string;
  jornadaNome: string;
  inicioVigencia: Date;
  fimVigencia: Date | null;
  criadoEm: Date;
}

export interface FuncionarioRegistro {
  id: string;
  nome: string;
  /** Somente digitos. A mascara por perfil (RNF-05) e feita no service. */
  cpf: string;
  matricula: string;
  cargo: string | null;
  admissao: Date;
  desligamento: Date | null;
  situacao: SituacaoFuncionario;
  /** Vinculo vigente na data de referencia da consulta (RF-010). */
  vinculoAtual: VinculoRegistro | null;
  /** RN-08: base para saber se o funcionario pode entrar em lote. */
  temDadosPagamento: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface DadosFuncionario {
  nome: string;
  cpf: string;
  matricula: string;
  cargo: string | null;
  admissao: Date;
}

export interface AlteracaoFuncionario {
  nome?: string;
  matricula?: string;
  cargo?: string | null;
  admissao?: Date;
  desligamento?: Date | null;
  situacao?: SituacaoFuncionario;
}

export interface DadosPagamentoRegistro {
  funcionarioId: string;
  tipoChave: TipoChavePix | null;
  chavePixCriptografada: string | null;
  chavePixMascara: string | null;
  banco: string | null;
  agencia: string | null;
  contaCriptografada: string | null;
  contaMascara: string | null;
  validadoEm: Date | null;
  atualizadoEm: Date;
}

/** Valores gravados em dados_pagamento. Chave e conta ja criptografadas. */
export interface DadosPagamentoGravaveis {
  tipoChave: TipoChavePix | null;
  chavePixCriptografada: string | null;
  chavePixMascara: string | null;
  banco: string | null;
  agencia: string | null;
  contaCriptografada: string | null;
  contaMascara: string | null;
}

export interface DadosVinculo {
  obraId: string;
  jornadaId: string;
  inicioVigencia: Date;
  fimVigencia: Date | null;
}

export interface FiltroFuncionarios {
  busca?: string;
  /** Busca por CPF: comparada com a coluna, que guarda somente digitos. */
  buscaCpf?: string;
  situacao?: SituacaoFuncionario;
  obraId?: string;
  comVinculoVigente?: boolean;
  /** Escopo do encarregado (RN-05): so quem tem vinculo com estas obras. */
  obrasPermitidas?: readonly string[];
  /** Dia usado para decidir qual vinculo esta vigente. */
  referencia: Date;
  pular: number;
  limite: number;
}

const CAMPOS_VINCULO = {
  id: true,
  funcionarioId: true,
  obraId: true,
  jornadaId: true,
  inicioVigencia: true,
  fimVigencia: true,
  criadoEm: true,
  obra: { select: { nome: true } },
  jornada: { select: { nome: true } },
} as const;

/** Linha de vinculo como o Prisma devolve, antes de achatar os nomes. */
interface VinculoBruto {
  id: string;
  funcionarioId: string;
  obraId: string;
  jornadaId: string;
  inicioVigencia: Date;
  fimVigencia: Date | null;
  criadoEm: Date;
  obra: { nome: string };
  jornada: { nome: string };
}

interface FuncionarioBruto {
  id: string;
  nome: string;
  cpf: string;
  matricula: string;
  cargo: string | null;
  admissao: Date;
  desligamento: Date | null;
  situacao: SituacaoFuncionario;
  criadoEm: Date;
  atualizadoEm: Date;
  vinculos: VinculoBruto[];
  dadosPagamento: { chavePixCriptografada: string | null; contaCriptografada: string | null } | null;
}

function paraVinculo(bruto: VinculoBruto): VinculoRegistro {
  return {
    id: bruto.id,
    funcionarioId: bruto.funcionarioId,
    obraId: bruto.obraId,
    obraNome: bruto.obra.nome,
    jornadaId: bruto.jornadaId,
    jornadaNome: bruto.jornada.nome,
    inicioVigencia: bruto.inicioVigencia,
    fimVigencia: bruto.fimVigencia,
    criadoEm: bruto.criadoEm,
  };
}

function paraRegistro(bruto: FuncionarioBruto): FuncionarioRegistro {
  const vigente = bruto.vinculos[0];
  return {
    id: bruto.id,
    nome: bruto.nome,
    cpf: bruto.cpf,
    matricula: bruto.matricula,
    cargo: bruto.cargo,
    admissao: bruto.admissao,
    desligamento: bruto.desligamento,
    situacao: bruto.situacao,
    vinculoAtual: vigente ? paraVinculo(vigente) : null,
    temDadosPagamento:
      bruto.dadosPagamento !== null &&
      (bruto.dadosPagamento.chavePixCriptografada !== null ||
        bruto.dadosPagamento.contaCriptografada !== null),
    criadoEm: bruto.criadoEm,
    atualizadoEm: bruto.atualizadoEm,
  };
}

/**
 * Acesso ao banco do cadastro de funcionarios (RF-006, RF-007, RF-010, RF-012).
 *
 * Tudo pelo query builder do Prisma, parametrizado: nenhuma consulta e montada
 * por concatenacao de string. A chave Pix e a conta trafegam aqui apenas no
 * formato criptografado - quem cifra e decifra e o service (RNF-04).
 */
@Injectable()
export class FuncionariosRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Condicao do vinculo vigente na data de referencia. */
  private vigenteEm(referencia: Date) {
    return {
      inicioVigencia: { lte: referencia },
      OR: [{ fimVigencia: null }, { fimVigencia: { gte: referencia } }],
    };
  }

  private camposFuncionario(referencia: Date) {
    return {
      id: true,
      nome: true,
      cpf: true,
      matricula: true,
      cargo: true,
      admissao: true,
      desligamento: true,
      situacao: true,
      criadoEm: true,
      atualizadoEm: true,
      vinculos: {
        where: this.vigenteEm(referencia),
        select: CAMPOS_VINCULO,
        orderBy: [{ inicioVigencia: 'desc' as const }],
        take: 1,
      },
      dadosPagamento: { select: { chavePixCriptografada: true, contaCriptografada: true } },
    };
  }

  /**
   * Obras que a consulta pode alcancar: a obra pedida, as permitidas, ou a
   * intersecao das duas. `undefined` quando nao ha recorte por obra nenhum.
   */
  private interseccaoDeObras(filtro: FiltroFuncionarios): string[] | undefined {
    if (filtro.obrasPermitidas === undefined) {
      return filtro.obraId === undefined ? undefined : [filtro.obraId];
    }
    if (filtro.obraId === undefined) {
      return [...filtro.obrasPermitidas];
    }
    return filtro.obrasPermitidas.filter((obra) => obra === filtro.obraId);
  }

  async listar(
    filtro: FiltroFuncionarios,
  ): Promise<{ itens: FuncionarioRegistro[]; total: number }> {
    // Obra pedida e obras permitidas (RN-05) se combinam por intersecao, numa
    // condicao so: duas chaves `obraId` no mesmo objeto fariam a segunda
    // sobrescrever a primeira e o filtro do usuario seria silenciosamente
    // ignorado.
    const obrasDoFiltro = this.interseccaoDeObras(filtro);

    const vinculoAlgum = {
      ...(obrasDoFiltro ? { obraId: { in: obrasDoFiltro } } : {}),
      ...(filtro.comVinculoVigente ? this.vigenteEm(filtro.referencia) : {}),
    };

    const where = {
      ...(filtro.situacao ? { situacao: filtro.situacao } : {}),
      ...(Object.keys(vinculoAlgum).length > 0 ? { vinculos: { some: vinculoAlgum } } : {}),
      ...(filtro.busca || filtro.buscaCpf
        ? {
            OR: [
              ...(filtro.busca
                ? [
                    { nome: { contains: filtro.busca, mode: 'insensitive' as const } },
                    { matricula: { contains: filtro.busca, mode: 'insensitive' as const } },
                  ]
                : []),
              ...(filtro.buscaCpf ? [{ cpf: { startsWith: filtro.buscaCpf } }] : []),
            ],
          }
        : {}),
    };

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.funcionario.findMany({
        where,
        select: this.camposFuncionario(filtro.referencia),
        orderBy: [{ nome: 'asc' }],
        skip: filtro.pular,
        take: filtro.limite,
      }),
      this.prisma.funcionario.count({ where }),
    ]);

    return { itens: (itens as FuncionarioBruto[]).map(paraRegistro), total };
  }

  async buscarPorId(id: string, referencia: Date): Promise<FuncionarioRegistro | null> {
    const bruto = await this.prisma.funcionario.findUnique({
      where: { id },
      select: this.camposFuncionario(referencia),
    });

    return bruto ? paraRegistro(bruto) : null;
  }

  buscarPorCpf(cpf: string): Promise<{ id: string } | null> {
    return this.prisma.funcionario.findUnique({ where: { cpf }, select: { id: true } });
  }

  buscarPorMatricula(matricula: string): Promise<{ id: string } | null> {
    return this.prisma.funcionario.findFirst({
      where: { matricula: { equals: matricula, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  async criar(dados: DadosFuncionario, referencia: Date): Promise<FuncionarioRegistro> {
    const criado = await this.prisma.funcionario.create({
      data: dados,
      select: this.camposFuncionario(referencia),
    });

    return paraRegistro(criado);
  }

  async atualizar(
    id: string,
    dados: AlteracaoFuncionario,
    referencia: Date,
  ): Promise<FuncionarioRegistro> {
    const atualizado = await this.prisma.funcionario.update({
      where: { id },
      data: dados,
      select: this.camposFuncionario(referencia),
    });

    return paraRegistro(atualizado);
  }

  /**
   * Obras alcancadas por algum vinculo do funcionario. Base da verificacao de
   * escopo do encarregado (RN-05), que roda a partir do usuario autenticado.
   */
  async obrasDoFuncionario(funcionarioId: string): Promise<string[]> {
    const vinculos = await this.prisma.vinculoFuncionario.findMany({
      where: { funcionarioId },
      select: { obraId: true },
      distinct: ['obraId'],
    });
    return vinculos.map((vinculo) => vinculo.obraId);
  }

  // -------------------------------------------------------------------------
  // RF-007 - dados de pagamento
  // -------------------------------------------------------------------------

  dadosPagamento(funcionarioId: string): Promise<DadosPagamentoRegistro | null> {
    return this.prisma.dadosPagamento.findUnique({
      where: { funcionarioId },
      select: {
        funcionarioId: true,
        tipoChave: true,
        chavePixCriptografada: true,
        chavePixMascara: true,
        banco: true,
        agencia: true,
        contaCriptografada: true,
        contaMascara: true,
        validadoEm: true,
        atualizadoEm: true,
      },
    });
  }

  /**
   * Grava os dados de pagamento substituindo o registro inteiro.
   *
   * `validadoEm` volta a nulo: trocar a chave invalida a validacao de
   * titularidade feita antes (RF-037).
   */
  async definirDadosPagamento(
    funcionarioId: string,
    dados: DadosPagamentoGravaveis,
  ): Promise<DadosPagamentoRegistro> {
    await this.prisma.dadosPagamento.upsert({
      where: { funcionarioId },
      create: { funcionarioId, ...dados, validadoEm: null },
      update: { ...dados, validadoEm: null },
      select: { id: true },
    });

    return (await this.dadosPagamento(funcionarioId)) as DadosPagamentoRegistro;
  }

  // -------------------------------------------------------------------------
  // RF-010 - vinculo funcionario x obra x jornada
  // -------------------------------------------------------------------------

  async listarVinculos(funcionarioId: string): Promise<VinculoRegistro[]> {
    const itens = await this.prisma.vinculoFuncionario.findMany({
      where: { funcionarioId },
      select: CAMPOS_VINCULO,
      orderBy: [{ inicioVigencia: 'desc' }],
    });

    return itens.map(paraVinculo);
  }

  async buscarVinculo(id: string): Promise<VinculoRegistro | null> {
    const bruto = await this.prisma.vinculoFuncionario.findUnique({
      where: { id },
      select: CAMPOS_VINCULO,
    });

    return bruto ? paraVinculo(bruto) : null;
  }

  async criarVinculo(funcionarioId: string, dados: DadosVinculo): Promise<VinculoRegistro> {
    const criado = await this.prisma.vinculoFuncionario.create({
      data: { funcionarioId, ...dados },
      select: CAMPOS_VINCULO,
    });

    return paraVinculo(criado);
  }

  async atualizarVinculo(id: string, dados: Partial<DadosVinculo>): Promise<VinculoRegistro> {
    const atualizado = await this.prisma.vinculoFuncionario.update({
      where: { id },
      data: dados,
      select: CAMPOS_VINCULO,
    });

    return paraVinculo(atualizado);
  }

  // -------------------------------------------------------------------------
  // RF-012 - importacao por planilha
  // -------------------------------------------------------------------------

  /**
   * Quais CPFs e matriculas da planilha ja existem.
   *
   * Uma consulta para o lote inteiro, em vez de duas por linha: planilha de
   * 2000 linhas nao vira 4000 idas ao banco.
   */
  async existentes(
    cpfs: readonly string[],
    matriculas: readonly string[],
  ): Promise<{ cpfs: Set<string>; matriculas: Set<string> }> {
    if (cpfs.length === 0 && matriculas.length === 0) {
      return { cpfs: new Set(), matriculas: new Set() };
    }

    const achados = await this.prisma.funcionario.findMany({
      where: {
        OR: [
          ...(cpfs.length > 0 ? [{ cpf: { in: [...cpfs] } }] : []),
          ...(matriculas.length > 0 ? [{ matricula: { in: [...matriculas] } }] : []),
        ],
      },
      select: { cpf: true, matricula: true },
    });

    return {
      cpfs: new Set(achados.map((item) => item.cpf)),
      matriculas: new Set(achados.map((item) => item.matricula)),
    };
  }

  /**
   * Cria as linhas aceitas da planilha numa unica transacao: ou a importacao
   * vale inteira, ou nada e gravado.
   */
  async criarMuitos(itens: readonly DadosFuncionario[]): Promise<number> {
    if (itens.length === 0) {
      return 0;
    }
    const resultado = await this.prisma.$transaction((tx) =>
      tx.funcionario.createMany({ data: [...itens] }),
    );
    return resultado.count;
  }
}
