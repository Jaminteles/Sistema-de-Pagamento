import { Injectable } from '@nestjs/common';
import { PerfilUsuario } from '@sistema/shared';
import { PrismaService } from '../common/prisma/prisma.service';

/** Campos que a API pode devolver. senhaHash nunca entra aqui. */
const CAMPOS_PUBLICOS = {
  id: true,
  nome: true,
  email: true,
  perfil: true,
  ativo: true,
  criadoEm: true,
  atualizadoEm: true,
} as const;

export interface UsuarioRegistro {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

/** A transacao de atualizacao deixaria o sistema sem administrador ativo. */
export class SemAdministradorAtivoError extends Error {
  constructor() {
    super('O sistema precisa de pelo menos um administrador ativo.');
    this.name = 'SemAdministradorAtivoError';
  }
}

export interface FiltroBusca {
  busca?: string;
  perfil?: PerfilUsuario;
  ativo?: boolean;
  pular: number;
  limite: number;
}

/**
 * Acesso ao banco do modulo de usuarios.
 *
 * Todas as consultas usam o query builder do Prisma (parametrizado): nao existe
 * SQL montado por concatenacao de string.
 */
@Injectable()
export class UsuariosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtro: FiltroBusca): Promise<{ itens: UsuarioRegistro[]; total: number }> {
    const where = {
      ...(filtro.perfil ? { perfil: filtro.perfil } : {}),
      ...(filtro.ativo === undefined ? {} : { ativo: filtro.ativo }),
      ...(filtro.busca
        ? {
            OR: [
              { nome: { contains: filtro.busca, mode: 'insensitive' as const } },
              { email: { contains: filtro.busca, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.usuario.findMany({
        where,
        select: CAMPOS_PUBLICOS,
        orderBy: [{ nome: 'asc' }],
        skip: filtro.pular,
        take: filtro.limite,
      }),
      this.prisma.usuario.count({ where }),
    ]);

    return { itens, total };
  }

  buscarPorId(id: string): Promise<UsuarioRegistro | null> {
    return this.prisma.usuario.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
  }

  buscarPorEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.usuario.findUnique({ where: { email }, select: { id: true } });
  }

  criar(dados: {
    nome: string;
    email: string;
    senhaHash: string;
    perfil: PerfilUsuario;
  }): Promise<UsuarioRegistro> {
    return this.prisma.usuario.create({ data: dados, select: CAMPOS_PUBLICOS });
  }

  /**
   * Atualiza o usuario.
   *
   * Quando a alteracao pode tirar o ultimo administrador do ar, a gravacao e a
   * contagem de admins ativos acontecem na mesma transacao serializavel: duas
   * requisicoes simultaneas nao conseguem, juntas, deixar o sistema sem
   * administrador.
   */
  atualizar(
    id: string,
    dados: { nome?: string; perfil?: PerfilUsuario; ativo?: boolean },
    garantirAdminAtivo = false,
  ): Promise<UsuarioRegistro> {
    if (!garantirAdminAtivo) {
      return this.prisma.usuario.update({ where: { id }, data: dados, select: CAMPOS_PUBLICOS });
    }

    return this.prisma.$transaction(
      async (tx) => {
        const atualizado = await tx.usuario.update({
          where: { id },
          data: dados,
          select: CAMPOS_PUBLICOS,
        });

        const adminsAtivos = await tx.usuario.count({
          where: { perfil: PerfilUsuario.ADMIN, ativo: true },
        });

        if (adminsAtivos === 0) {
          // Desfaz a gravacao: ninguem mais entraria para arrumar.
          throw new SemAdministradorAtivoError();
        }

        return atualizado;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async definirSenha(id: string, senhaHash: string): Promise<void> {
    await this.prisma.usuario.update({
      where: { id },
      data: { senhaHash, senhaAlteradaEm: new Date() },
      select: { id: true },
    });
  }

  /** Pre-checagem amigavel; a garantia de verdade esta na transacao de atualizar. */
  contarAdminsAtivos(ignorarId?: string): Promise<number> {
    return this.prisma.usuario.count({
      where: {
        perfil: PerfilUsuario.ADMIN,
        ativo: true,
        ...(ignorarId ? { id: { not: ignorarId } } : {}),
      },
    });
  }
}
