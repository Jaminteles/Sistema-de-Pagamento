import { randomUUID } from 'node:crypto';
import type {
  AlteracaoFuncionario,
  DadosFuncionario,
  DadosPagamentoGravaveis,
  DadosPagamentoRegistro,
  DadosVinculo,
  FiltroFuncionarios,
  FuncionarioRegistro,
  VinculoRegistro,
} from '../src/funcionarios/funcionarios.repository';

/**
 * Duble em memoria do repositorio de funcionarios (sprint 4).
 *
 * Reproduz as consultas que os services usam - inclusive o recorte por obra do
 * encarregado (RN-05) e a escolha do vinculo vigente - sem PostgreSQL rodando.
 * A chave Pix e a conta passam por aqui apenas no formato criptografado, como
 * acontece no banco.
 */

const AGORA = new Date('2026-11-23T12:00:00.000Z');
const ADMISSAO_PADRAO = new Date('2026-01-05T00:00:00.000Z');

function contem(valor: string | null, termo: string): boolean {
  return (valor ?? '').toLowerCase().includes(termo.toLowerCase());
}

export class FuncionariosRepositorioEmMemoria {
  readonly funcionarios: FuncionarioRegistro[] = [];
  readonly vinculos: VinculoRegistro[] = [];
  readonly pagamentos = new Map<string, DadosPagamentoRegistro>();
  /** Quantas linhas a importacao gravou. Usado para provar que a previa nao grava. */
  criadosEmLote = 0;

  semear(
    funcionario: Partial<FuncionarioRegistro> & { id: string; cpf: string; matricula: string },
  ): FuncionarioRegistro {
    const registro: FuncionarioRegistro = {
      nome: 'Funcionario',
      cargo: null,
      admissao: ADMISSAO_PADRAO,
      desligamento: null,
      situacao: 'ATIVO',
      vinculoAtual: null,
      temDadosPagamento: false,
      criadoEm: AGORA,
      atualizadoEm: AGORA,
      ...funcionario,
    };
    this.funcionarios.push(registro);
    return registro;
  }

  semearVinculo(vinculo: Partial<VinculoRegistro> & { id: string; funcionarioId: string }): void {
    this.vinculos.push({
      obraId: 'obra',
      obraNome: 'Obra',
      jornadaId: 'jornada',
      jornadaNome: 'Comercial',
      inicioVigencia: ADMISSAO_PADRAO,
      fimVigencia: null,
      criadoEm: AGORA,
      ...vinculo,
    });
  }

  private vigente(vinculo: VinculoRegistro, referencia: Date): boolean {
    return (
      vinculo.inicioVigencia <= referencia &&
      (vinculo.fimVigencia === null || vinculo.fimVigencia >= referencia)
    );
  }

  /** Monta os campos derivados (vinculo vigente e dados de pagamento). */
  private montar(registro: FuncionarioRegistro, referencia: Date): FuncionarioRegistro {
    const doFuncionario = this.vinculos
      .filter((item) => item.funcionarioId === registro.id)
      .sort((a, b) => b.inicioVigencia.getTime() - a.inicioVigencia.getTime());

    const pagamento = this.pagamentos.get(registro.id);

    return {
      ...registro,
      vinculoAtual: doFuncionario.find((item) => this.vigente(item, referencia)) ?? null,
      temDadosPagamento:
        pagamento !== undefined &&
        (pagamento.chavePixCriptografada !== null || pagamento.contaCriptografada !== null),
    };
  }

  listar(filtro: FiltroFuncionarios): Promise<{ itens: FuncionarioRegistro[]; total: number }> {
    let itens = this.funcionarios.map((item) => this.montar(item, filtro.referencia));

    if (filtro.situacao) {
      itens = itens.filter((item) => item.situacao === filtro.situacao);
    }

    const exigeVinculo =
      filtro.obraId !== undefined ||
      filtro.obrasPermitidas !== undefined ||
      filtro.comVinculoVigente === true;

    if (exigeVinculo) {
      itens = itens.filter((item) =>
        this.vinculos.some(
          (vinculo) =>
            vinculo.funcionarioId === item.id &&
            (filtro.obraId === undefined || vinculo.obraId === filtro.obraId) &&
            (filtro.obrasPermitidas === undefined ||
              filtro.obrasPermitidas.includes(vinculo.obraId)) &&
            (filtro.comVinculoVigente !== true || this.vigente(vinculo, filtro.referencia)),
        ),
      );
    }

    if (filtro.busca !== undefined || filtro.buscaCpf !== undefined) {
      const termo = filtro.busca ?? '';
      const digitos = filtro.buscaCpf ?? '';
      itens = itens.filter(
        (item) =>
          (termo.length > 0 && (contem(item.nome, termo) || contem(item.matricula, termo))) ||
          (digitos.length > 0 && item.cpf.startsWith(digitos)),
      );
    }

    itens.sort((a, b) => a.nome.localeCompare(b.nome));
    const total = itens.length;
    return Promise.resolve({
      itens: itens.slice(filtro.pular, filtro.pular + filtro.limite),
      total,
    });
  }

  buscarPorId(id: string, referencia: Date): Promise<FuncionarioRegistro | null> {
    const achado = this.funcionarios.find((item) => item.id === id);
    return Promise.resolve(achado ? this.montar(achado, referencia) : null);
  }

  buscarPorCpf(cpf: string): Promise<{ id: string } | null> {
    const achado = this.funcionarios.find((item) => item.cpf === cpf);
    return Promise.resolve(achado ? { id: achado.id } : null);
  }

  buscarPorMatricula(matricula: string): Promise<{ id: string } | null> {
    const achado = this.funcionarios.find(
      (item) => item.matricula.toLowerCase() === matricula.toLowerCase(),
    );
    return Promise.resolve(achado ? { id: achado.id } : null);
  }

  criar(dados: DadosFuncionario, referencia: Date): Promise<FuncionarioRegistro> {
    const criado = this.semear({ id: randomUUID(), ...dados });
    return Promise.resolve(this.montar(criado, referencia));
  }

  atualizar(
    id: string,
    dados: AlteracaoFuncionario,
    referencia: Date,
  ): Promise<FuncionarioRegistro> {
    const indice = this.funcionarios.findIndex((item) => item.id === id);
    if (indice < 0) {
      return Promise.reject(new Error('Funcionario inexistente.'));
    }
    const atual = this.funcionarios[indice] as FuncionarioRegistro;
    const atualizado: FuncionarioRegistro = { ...atual, ...dados, atualizadoEm: new Date() };
    this.funcionarios[indice] = atualizado;
    return Promise.resolve(this.montar(atualizado, referencia));
  }

  obrasDoFuncionario(funcionarioId: string): Promise<string[]> {
    const obras = this.vinculos
      .filter((item) => item.funcionarioId === funcionarioId)
      .map((item) => item.obraId);
    return Promise.resolve([...new Set(obras)]);
  }

  dadosPagamento(funcionarioId: string): Promise<DadosPagamentoRegistro | null> {
    return Promise.resolve(this.pagamentos.get(funcionarioId) ?? null);
  }

  definirDadosPagamento(
    funcionarioId: string,
    dados: DadosPagamentoGravaveis,
  ): Promise<DadosPagamentoRegistro> {
    const registro: DadosPagamentoRegistro = {
      funcionarioId,
      ...dados,
      validadoEm: null,
      atualizadoEm: new Date(),
    };
    this.pagamentos.set(funcionarioId, registro);
    return Promise.resolve(registro);
  }

  listarVinculos(funcionarioId: string): Promise<VinculoRegistro[]> {
    const itens = this.vinculos
      .filter((item) => item.funcionarioId === funcionarioId)
      .sort((a, b) => b.inicioVigencia.getTime() - a.inicioVigencia.getTime());
    return Promise.resolve(itens);
  }

  buscarVinculo(id: string): Promise<VinculoRegistro | null> {
    return Promise.resolve(this.vinculos.find((item) => item.id === id) ?? null);
  }

  criarVinculo(funcionarioId: string, dados: DadosVinculo): Promise<VinculoRegistro> {
    const criado: VinculoRegistro = {
      id: randomUUID(),
      funcionarioId,
      obraNome: 'Obra',
      jornadaNome: 'Comercial',
      criadoEm: new Date(),
      ...dados,
    };
    this.vinculos.push(criado);
    return Promise.resolve(criado);
  }

  atualizarVinculo(id: string, dados: Partial<DadosVinculo>): Promise<VinculoRegistro> {
    const indice = this.vinculos.findIndex((item) => item.id === id);
    if (indice < 0) {
      return Promise.reject(new Error('Vinculo inexistente.'));
    }
    const atual = this.vinculos[indice] as VinculoRegistro;
    const atualizado: VinculoRegistro = { ...atual, ...dados };
    this.vinculos[indice] = atualizado;
    return Promise.resolve(atualizado);
  }

  existentes(
    cpfs: readonly string[],
    matriculas: readonly string[],
  ): Promise<{ cpfs: Set<string>; matriculas: Set<string> }> {
    const achados = this.funcionarios.filter(
      (item) => cpfs.includes(item.cpf) || matriculas.includes(item.matricula),
    );
    return Promise.resolve({
      cpfs: new Set(achados.map((item) => item.cpf)),
      matriculas: new Set(achados.map((item) => item.matricula)),
    });
  }

  criarMuitos(itens: readonly DadosFuncionario[]): Promise<number> {
    for (const item of itens) {
      this.semear({ id: randomUUID(), ...item });
    }
    this.criadosEmLote += itens.length;
    return Promise.resolve(itens.length);
  }
}
