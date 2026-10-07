import { randomUUID } from 'node:crypto';
import type { PerfilUsuario } from '@sistema/shared';

export interface UsuarioFalso {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  senhaAlteradaEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface SessaoFalsa {
  id: string;
  usuarioId: string;
  tokenHash: string;
  expiraEm: Date;
  revogadaEm: Date | null;
  motivo: string | null;
  ip: string | null;
  userAgent: string | null;
  criadoEm: Date;
}

export interface LogFalso {
  id: string;
  usuarioId: string | null;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  antes: unknown;
  depois: unknown;
  ip: string | null;
  userAgent: string | null;
  criadoEm: Date;
}

interface Where {
  id?: string | { not?: string };
  email?: string;
  tokenHash?: string;
  usuarioId?: string;
  perfil?: PerfilUsuario;
  ativo?: boolean;
  revogadaEm?: null;
  OR?: { nome?: { contains: string }; email?: { contains: string } }[];
}

/** Projeta somente os campos pedidos no `select`, como o Prisma faz. */
function projetar<T extends object>(linha: T, select?: Record<string, unknown>): unknown {
  if (!select) {
    return { ...linha };
  }

  const saida: Record<string, unknown> = {};
  for (const [campo, pedido] of Object.entries(select)) {
    if (!pedido) {
      continue;
    }
    saida[campo] = (linha as Record<string, unknown>)[campo];
  }
  return saida;
}

/**
 * Banco em memoria com o recorte de Prisma que os testes de autenticacao usam.
 *
 * Existe para que nenhum teste automatizado precise de PostgreSQL rodando:
 * o contrato HTTP, os guards e a auditoria sao exercitados de ponta a ponta,
 * sem conexao real e sem chamada externa.
 */
export class PrismaEmMemoria {
  readonly usuarios: UsuarioFalso[] = [];
  readonly sessoes: SessaoFalsa[] = [];
  readonly logs: LogFalso[] = [];

  readonly usuario = {
    findUnique: ({ where, select }: { where: Where; select?: Record<string, unknown> }) => {
      const achado = this.usuarios.find(
        (item) =>
          (typeof where.id === 'string' && item.id === where.id) ||
          (where.email !== undefined && item.email === where.email),
      );
      if (!achado) {
        return Promise.resolve(null);
      }
      const projetado = projetar(achado, select) as Record<string, unknown>;
      if (select?.['obras']) {
        projetado['obras'] = [];
      }
      return Promise.resolve(projetado);
    },

    findMany: ({
      where,
      select,
      skip = 0,
      take = 20,
    }: {
      where?: Where;
      select?: Record<string, unknown>;
      skip?: number;
      take?: number;
    }) =>
      Promise.resolve(
        this.filtrarUsuarios(where)
          .sort((a, b) => a.nome.localeCompare(b.nome))
          .slice(skip, skip + take)
          .map((linha) => projetar(linha, select)),
      ),

    count: ({ where }: { where?: Where }) => Promise.resolve(this.filtrarUsuarios(where).length),

    create: ({
      data,
      select,
    }: {
      data: Omit<UsuarioFalso, 'id' | 'ativo' | 'senhaAlteradaEm' | 'criadoEm' | 'atualizadoEm'>;
      select?: Record<string, unknown>;
    }) => {
      const agora = new Date();
      const linha: UsuarioFalso = {
        id: randomUUID(),
        ativo: true,
        senhaAlteradaEm: null,
        criadoEm: agora,
        atualizadoEm: agora,
        ...data,
      };
      this.usuarios.push(linha);
      return Promise.resolve(projetar(linha, select));
    },

    update: ({
      where,
      data,
      select,
    }: {
      where: Where;
      data: Partial<UsuarioFalso>;
      select?: Record<string, unknown>;
    }) => {
      const indice = this.usuarios.findIndex((item) => item.id === where.id);
      if (indice < 0) {
        return Promise.reject(new Error('Registro nao encontrado.'));
      }
      const atual = this.usuarios[indice] as UsuarioFalso;
      const atualizado: UsuarioFalso = { ...atual, ...data, atualizadoEm: new Date() };
      this.usuarios[indice] = atualizado;
      return Promise.resolve(projetar(atualizado, select));
    },
  };

  readonly sessaoRefresh = {
    create: ({
      data,
      select,
    }: {
      data: Omit<SessaoFalsa, 'revogadaEm' | 'motivo' | 'criadoEm'>;
      select?: Record<string, unknown>;
    }) => {
      const linha: SessaoFalsa = {
        revogadaEm: null,
        motivo: null,
        criadoEm: new Date(),
        ...data,
      };
      this.sessoes.push(linha);
      return Promise.resolve(projetar(linha, select));
    },

    findUnique: ({ where, select }: { where: Where; select?: Record<string, unknown> }) => {
      const achada = this.sessoes.find(
        (item) =>
          (typeof where.id === 'string' && item.id === where.id) ||
          (where.tokenHash !== undefined && item.tokenHash === where.tokenHash),
      );
      if (!achada) {
        return Promise.resolve(null);
      }
      const projetado = projetar(achada, select) as Record<string, unknown>;
      if (select?.['usuario']) {
        const dono = this.usuarios.find((item) => item.id === achada.usuarioId);
        projetado['usuario'] = { ativo: dono?.ativo ?? false, perfil: dono?.perfil };
      }
      return Promise.resolve(projetado);
    },

    updateMany: ({
      where,
      data,
    }: {
      where: Where;
      data: { revogadaEm: Date; motivo: string };
    }) => {
      let count = 0;
      for (const linha of this.sessoes) {
        const casaId = where.id === undefined || linha.id === where.id;
        const casaUsuario = where.usuarioId === undefined || linha.usuarioId === where.usuarioId;
        const casaAberta = where.revogadaEm !== null || linha.revogadaEm === null;
        if (casaId && casaUsuario && casaAberta) {
          linha.revogadaEm = data.revogadaEm;
          linha.motivo = data.motivo;
          count += 1;
        }
      }
      return Promise.resolve({ count });
    },
  };

  readonly logAuditoria = {
    create: ({
      data,
      select,
    }: {
      data: Omit<LogFalso, 'id' | 'criadoEm' | 'antes' | 'depois'> & {
        antes?: unknown;
        depois?: unknown;
      };
      select?: Record<string, unknown>;
    }) => {
      const linha: LogFalso = {
        id: randomUUID(),
        criadoEm: new Date(),
        antes: null,
        depois: null,
        ...data,
      };
      this.logs.push(linha);
      return Promise.resolve(projetar(linha, select));
    },
  };

  /**
   * Aceita as duas formas que o repositorio usa: a lista de operacoes (listar e
   * contar de uma vez) e a funcao de transacao (trava do ultimo administrador).
   *
   * O dublê nao desfaz escrita: a transacao de verdade e exercitada no
   * PostgreSQL. Aqui interessa apenas que o fluxo chame o callback e propague o
   * erro quando a regra for violada.
   */
  $transaction(
    operacoes: Promise<unknown>[] | ((tx: PrismaEmMemoria) => Promise<unknown>),
  ): Promise<unknown> {
    if (typeof operacoes === 'function') {
      return operacoes(this);
    }
    return Promise.all(operacoes);
  }

  $queryRaw(): Promise<unknown> {
    return Promise.resolve([{ '?column?': 1 }]);
  }

  $connect(): Promise<void> {
    return Promise.resolve();
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }

  logsDaAcao(acao: string): LogFalso[] {
    return this.logs.filter((linha) => linha.acao === acao);
  }

  private filtrarUsuarios(where?: Where): UsuarioFalso[] {
    if (!where) {
      return [...this.usuarios];
    }

    return this.usuarios.filter((item) => {
      if (where.perfil !== undefined && item.perfil !== where.perfil) {
        return false;
      }
      if (where.ativo !== undefined && item.ativo !== where.ativo) {
        return false;
      }
      if (typeof where.id === 'object' && where.id?.not !== undefined && item.id === where.id.not) {
        return false;
      }
      if (where.OR) {
        const termo = (where.OR[0]?.nome?.contains ?? '').toLowerCase();
        const casa =
          item.nome.toLowerCase().includes(termo) || item.email.toLowerCase().includes(termo);
        if (!casa) {
          return false;
        }
      }
      return true;
    });
  }
}
