import { randomUUID } from 'node:crypto';
import type { AbrangenciaFeriado } from '@sistema/shared';
import type {
  DadosFeriado,
  FeriadoRegistro,
  FiltroFeriados,
} from '../src/feriados/feriados.repository';
import type {
  DadosJornada,
  FiltroJornadas,
  JornadaRegistro,
} from '../src/jornadas/jornadas.repository';
import type { EncarregadoRegistro, FiltroObras, ObraRegistro } from '../src/obras/obras.repository';

/**
 * Dubles em memoria dos repositorios de cadastro, usados pelos testes de ponta
 * a ponta da sprint 3.
 *
 * Substituem o repositorio (e nao o PrismaService) de proposito: o que esses
 * testes precisam exercitar e o caminho HTTP completo - guards de perfil,
 * DTOs, escopo do encarregado e formato de erro - sem reimplementar a semantica
 * do Prisma e sem PostgreSQL rodando.
 */

const AGORA = new Date('2026-11-09T12:00:00.000Z');

function contem(valor: string | null, termo: string): boolean {
  return (valor ?? '').toLowerCase().includes(termo.toLowerCase());
}

export class ObrasRepositorioEmMemoria {
  readonly obras: ObraRegistro[] = [];
  /** usuarioId -> obras vinculadas. */
  readonly vinculos = new Map<string, string[]>();
  /** Usuarios com perfil ENCARREGADO, para validar o vinculo. */
  readonly encarregados = new Set<string>();

  semear(obra: { id: string; nome: string; endereco?: string | null; ativa?: boolean }): void {
    this.obras.push({
      id: obra.id,
      nome: obra.nome,
      endereco: obra.endereco ?? null,
      ativa: obra.ativa ?? true,
      criadoEm: AGORA,
      atualizadoEm: AGORA,
    });
  }

  vincular(usuarioId: string, obraId: string): void {
    this.vinculos.set(usuarioId, [...(this.vinculos.get(usuarioId) ?? []), obraId]);
  }

  listar(filtro: FiltroObras): Promise<{ itens: ObraRegistro[]; total: number }> {
    let itens = [...this.obras];

    if (filtro.obrasPermitidas) {
      const permitidas = filtro.obrasPermitidas;
      itens = itens.filter((item) => permitidas.includes(item.id));
    }
    if (filtro.ativa !== undefined) {
      itens = itens.filter((item) => item.ativa === filtro.ativa);
    }
    if (filtro.busca) {
      const termo = filtro.busca;
      itens = itens.filter((item) => contem(item.nome, termo) || contem(item.endereco, termo));
    }

    itens.sort((a, b) => a.nome.localeCompare(b.nome));
    const total = itens.length;
    return Promise.resolve({
      itens: itens.slice(filtro.pular, filtro.pular + filtro.limite),
      total,
    });
  }

  buscarPorId(id: string): Promise<ObraRegistro | null> {
    return Promise.resolve(this.obras.find((item) => item.id === id) ?? null);
  }

  buscarPorNome(nome: string): Promise<{ id: string } | null> {
    const achada = this.obras.find((item) => item.nome.toLowerCase() === nome.toLowerCase());
    return Promise.resolve(achada ? { id: achada.id } : null);
  }

  criar(dados: { nome: string; endereco: string | null }): Promise<ObraRegistro> {
    const criada: ObraRegistro = {
      id: randomUUID(),
      nome: dados.nome,
      endereco: dados.endereco,
      ativa: true,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };
    this.obras.push(criada);
    return Promise.resolve(criada);
  }

  atualizar(
    id: string,
    dados: { nome?: string; endereco?: string | null; ativa?: boolean },
  ): Promise<ObraRegistro> {
    const indice = this.obras.findIndex((item) => item.id === id);
    if (indice < 0) {
      return Promise.reject(new Error('Obra inexistente.'));
    }
    const atual = this.obras[indice] as ObraRegistro;
    const atualizada: ObraRegistro = { ...atual, ...dados, atualizadoEm: new Date() };
    this.obras[indice] = atualizada;
    return Promise.resolve(atualizada);
  }

  obrasDoUsuario(usuarioId: string): Promise<string[]> {
    return Promise.resolve([...(this.vinculos.get(usuarioId) ?? [])]);
  }

  encarregadosDaObra(obraId: string): Promise<EncarregadoRegistro[]> {
    const itens = [...this.vinculos.entries()]
      .filter(([, obras]) => obras.includes(obraId))
      .map(([usuarioId]) => ({
        usuarioId,
        nome: `Encarregado ${usuarioId}`,
        email: `${usuarioId}@empresa.com.br`,
        ativo: true,
      }));
    return Promise.resolve(itens);
  }

  encarregadosExistentes(usuariosIds: readonly string[]): Promise<string[]> {
    return Promise.resolve(usuariosIds.filter((id) => this.encarregados.has(id)));
  }

  definirEncarregados(obraId: string, usuariosIds: readonly string[]): Promise<void> {
    for (const [usuarioId, obras] of this.vinculos) {
      this.vinculos.set(
        usuarioId,
        obras.filter((obra) => obra !== obraId),
      );
    }
    for (const usuarioId of usuariosIds) {
      this.vincular(usuarioId, obraId);
    }
    return Promise.resolve();
  }
}

export class JornadasRepositorioEmMemoria {
  readonly jornadas: JornadaRegistro[] = [];

  semear(jornada: DadosJornada & { id: string; ativa?: boolean }): void {
    const { id, ativa, ...dados } = jornada;
    this.jornadas.push({
      id,
      ativa: ativa ?? true,
      criadoEm: AGORA,
      atualizadoEm: AGORA,
      ...dados,
    });
  }

  listar(filtro: FiltroJornadas): Promise<{ itens: JornadaRegistro[]; total: number }> {
    let itens = [...this.jornadas];

    if (filtro.ativa !== undefined) {
      itens = itens.filter((item) => item.ativa === filtro.ativa);
    }
    if (filtro.busca) {
      const termo = filtro.busca;
      itens = itens.filter((item) => contem(item.nome, termo));
    }

    itens.sort((a, b) => a.nome.localeCompare(b.nome));
    const total = itens.length;
    return Promise.resolve({
      itens: itens.slice(filtro.pular, filtro.pular + filtro.limite),
      total,
    });
  }

  buscarPorId(id: string): Promise<JornadaRegistro | null> {
    return Promise.resolve(this.jornadas.find((item) => item.id === id) ?? null);
  }

  buscarPorNome(nome: string): Promise<{ id: string } | null> {
    const achada = this.jornadas.find((item) => item.nome.toLowerCase() === nome.toLowerCase());
    return Promise.resolve(achada ? { id: achada.id } : null);
  }

  criar(dados: DadosJornada): Promise<JornadaRegistro> {
    const criada: JornadaRegistro = {
      id: randomUUID(),
      ativa: true,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
      ...dados,
    };
    this.jornadas.push(criada);
    return Promise.resolve(criada);
  }

  atualizar(
    id: string,
    dados: Partial<DadosJornada> & { ativa?: boolean },
  ): Promise<JornadaRegistro> {
    const indice = this.jornadas.findIndex((item) => item.id === id);
    if (indice < 0) {
      return Promise.reject(new Error('Jornada inexistente.'));
    }
    const atual = this.jornadas[indice] as JornadaRegistro;
    const atualizada: JornadaRegistro = { ...atual, ...dados, atualizadoEm: new Date() };
    this.jornadas[indice] = atualizada;
    return Promise.resolve(atualizada);
  }
}

export class FeriadosRepositorioEmMemoria {
  readonly feriados: FeriadoRegistro[] = [];

  private iso(data: Date): string {
    return data.toISOString().slice(0, 10);
  }

  semear(feriado: DadosFeriado & { id: string }): void {
    const { id, ...dados } = feriado;
    this.feriados.push({ id, criadoEm: AGORA, ...dados });
  }

  listar(filtro: FiltroFeriados): Promise<FeriadoRegistro[]> {
    let itens = this.feriados.filter(
      (item) => Number(this.iso(item.data).slice(0, 4)) === filtro.ano,
    );

    if (filtro.abrangencia) {
      const abrangencia: AbrangenciaFeriado = filtro.abrangencia;
      itens = itens.filter((item) => item.abrangencia === abrangencia);
    }
    if (filtro.busca) {
      const termo = filtro.busca;
      itens = itens.filter((item) => contem(item.descricao, termo));
    }

    itens.sort(
      (a, b) =>
        this.iso(a.data).localeCompare(this.iso(b.data)) || a.descricao.localeCompare(b.descricao),
    );
    return Promise.resolve(itens);
  }

  buscarPorId(id: string): Promise<FeriadoRegistro | null> {
    return Promise.resolve(this.feriados.find((item) => item.id === id) ?? null);
  }

  buscarPorDataEDescricao(data: Date, descricao: string): Promise<{ id: string } | null> {
    const achado = this.feriados.find(
      (item) =>
        this.iso(item.data) === this.iso(data) &&
        item.descricao.toLowerCase() === descricao.toLowerCase(),
    );
    return Promise.resolve(achado ? { id: achado.id } : null);
  }

  criar(dados: DadosFeriado): Promise<FeriadoRegistro> {
    const criado: FeriadoRegistro = { id: randomUUID(), criadoEm: new Date(), ...dados };
    this.feriados.push(criado);
    return Promise.resolve(criado);
  }

  atualizar(id: string, dados: Partial<DadosFeriado>): Promise<FeriadoRegistro> {
    const indice = this.feriados.findIndex((item) => item.id === id);
    if (indice < 0) {
      return Promise.reject(new Error('Feriado inexistente.'));
    }
    const atual = this.feriados[indice] as FeriadoRegistro;
    const atualizado: FeriadoRegistro = { ...atual, ...dados };
    this.feriados[indice] = atualizado;
    return Promise.resolve(atualizado);
  }

  remover(id: string): Promise<void> {
    const indice = this.feriados.findIndex((item) => item.id === id);
    if (indice >= 0) {
      this.feriados.splice(indice, 1);
    }
    return Promise.resolve();
  }

  criarMuitosIgnorandoExistentes(itens: readonly DadosFeriado[]): Promise<number> {
    let criados = 0;
    for (const item of itens) {
      const existe = this.feriados.some(
        (linha) =>
          this.iso(linha.data) === this.iso(item.data) && linha.descricao === item.descricao,
      );
      if (!existe) {
        this.feriados.push({ id: randomUUID(), criadoEm: new Date(), ...item });
        criados += 1;
      }
    }
    return Promise.resolve(criados);
  }
}
