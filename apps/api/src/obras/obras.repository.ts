import { Injectable } from '@nestjs/common';
import { PerfilUsuario } from '@sistema/shared';
import { PrismaService } from '../common/prisma/prisma.service';

/** Campos que a API devolve de uma obra. */
const CAMPOS_PUBLICOS = {
  id: true,
  nome: true,
  endereco: true,
  ativa: true,
  criadoEm: true,
  atualizadoEm: true,
} as const;

export interface ObraRegistro {
  id: string;
  nome: string;
  endereco: string | null;
  ativa: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface EncarregadoRegistro {
  usuarioId: string;
  nome: string;
  email: string;
  ativo: boolean;
}

export interface FiltroObras {
  busca?: string;
  ativa?: boolean;
  /** Restringe a consulta a estas obras (escopo do encarregado, RN-05). */
  obrasPermitidas?: readonly string[];
  pular: number;
  limite: number;
}

/**
 * Acesso ao banco do modulo de obras.
 *
 * Tudo pelo query builder do Prisma (parametrizado): nenhuma consulta e montada
 * por concatenacao de string.
 */
@Injectable()
export class ObrasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroObras): Promise<{ itens: ObraRegistro[]; total: number }> {
    const where = {
      ...(filtro.ativa === undefined ? {} : { ativa: filtro.ativa }),
      ...(filtro.obrasPermitidas ? { id: { in: [...filtro.obrasPermitidas] } } : {}),
      ...(filtro.busca
        ? {
            OR: [
              { nome: { contains: filtro.busca, mode: 'insensitive' as const } },
              { endereco: { contains: filtro.busca, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.obra.findMany({
        where,
        select: CAMPOS_PUBLICOS,
        orderBy: [{ nome: 'asc' }],
        skip: filtro.pular,
        take: filtro.limite,
      }),
      this.prisma.obra.count({ where }),
    ]);

    return { itens, total };
  }

  buscarPorId(id: string): Promise<ObraRegistro | null> {
    return this.prisma.obra.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
  }

  buscarPorNome(nome: string): Promise<{ id: string } | null> {
    return this.prisma.obra.findFirst({
      where: { nome: { equals: nome, mode: 'insensitive' } },
      select: { id: true },
    });
  }

  criar(dados: { nome: string; endereco: string | null }): Promise<ObraRegistro> {
    return this.prisma.obra.create({ data: dados, select: CAMPOS_PUBLICOS });
  }

  atualizar(
    id: string,
    dados: { nome?: string; endereco?: string | null; ativa?: boolean },
  ): Promise<ObraRegistro> {
    return this.prisma.obra.update({ where: { id }, data: dados, select: CAMPOS_PUBLICOS });
  }

  /** Ids das obras vinculadas ao usuario. Base do escopo do encarregado (RN-05). */
  async obrasDoUsuario(usuarioId: string): Promise<string[]> {
    const vinculos = await this.prisma.usuarioObra.findMany({
      where: { usuarioId },
      select: { obraId: true },
    });
    return vinculos.map((vinculo) => vinculo.obraId);
  }

  async encarregadosDaObra(obraId: string): Promise<EncarregadoRegistro[]> {
    const vinculos = await this.prisma.usuarioObra.findMany({
      where: { obraId },
      select: { usuario: { select: { id: true, nome: true, email: true, ativo: true } } },
      orderBy: { usuario: { nome: 'asc' } },
    });

    return vinculos.map((vinculo) => ({
      usuarioId: vinculo.usuario.id,
      nome: vinculo.usuario.nome,
      email: vinculo.usuario.email,
      ativo: vinculo.usuario.ativo,
    }));
  }

  /** Dos ids informados, quais sao de usuarios com perfil ENCARREGADO. */
  async encarregadosExistentes(usuariosIds: readonly string[]): Promise<string[]> {
    if (usuariosIds.length === 0) {
      return [];
    }
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: [...usuariosIds] }, perfil: PerfilUsuario.ENCARREGADO },
      select: { id: true },
    });
    return usuarios.map((usuario) => usuario.id);
  }

  /**
   * Substitui a lista de encarregados da obra numa transacao: ou a lista nova
   * vale inteira, ou nada muda.
   */
  async definirEncarregados(obraId: string, usuariosIds: readonly string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.usuarioObra.deleteMany({
        where: {
          obraId,
          ...(usuariosIds.length > 0 ? { usuarioId: { notIn: [...usuariosIds] } } : {}),
        },
      });

      if (usuariosIds.length > 0) {
        // `skipDuplicates` apoia-se na unique (usuarioId, obraId): mantem quem
        // ja estava vinculado, numa unica consulta em vez de um upsert por item.
        await tx.usuarioObra.createMany({
          data: usuariosIds.map((usuarioId) => ({ usuarioId, obraId })),
          skipDuplicates: true,
        });
      }
    });
  }
}
