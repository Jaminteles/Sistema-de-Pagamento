import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { EntradaAuditoria, ObjetoAuditavel } from './auditoria.types';

/**
 * Campos que nunca entram no log de auditoria, mesmo que o chamador os envie
 * por descuido. A comparacao e por nome normalizado (minusculas, sem separador).
 */
const CAMPOS_PROIBIDOS = new Set([
  'senha',
  'senhaatual',
  'novasenha',
  'senhahash',
  'hash',
  'token',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
  'secret',
  'segredo',
  'credencial',
  'certificado',
  'cpf',
  'chavepix',
  'conta',
  'agencia',
  'authorization',
  'cookie',
]);

/** Linha pronta para o Prisma, sem antes/depois quando nao houve mudanca registravel. */
interface DadosLogAuditoria {
  usuarioId: string | null;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  antes?: ObjetoAuditavel;
  depois?: ObjetoAuditavel;
  ip: string | null;
  userAgent: string | null;
}

const TAMANHO_MAXIMO_USER_AGENT = 255;
const TAMANHO_MAXIMO_IP = 64;

/** Remove o que nao pode ser auditado e descarta objetos vazios. */
function sanitizar(valor: ObjetoAuditavel | null | undefined): ObjetoAuditavel | null {
  if (!valor) {
    return null;
  }

  const limpo: ObjetoAuditavel = {};

  for (const [chave, conteudo] of Object.entries(valor)) {
    const normalizada = chave.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (CAMPOS_PROIBIDOS.has(normalizada)) {
      continue;
    }
    limpo[chave] = conteudo;
  }

  return Object.keys(limpo).length > 0 ? limpo : null;
}

/**
 * Registro das acoes sensiveis do sistema (RF-005).
 *
 * Uma falha ao gravar o log nunca derruba a operacao de negocio: o erro vai
 * para o log do servidor e a requisicao segue. Quando a acao precisa ser
 * atomica junto com o dado (aprovacao de lote, por exemplo), passe o client da
 * transacao em `registrarNaTransacao`.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Grava fora de transacao. Nao lanca: auditoria nunca quebra a operacao. */
  async registrar(entrada: EntradaAuditoria): Promise<void> {
    try {
      await this.prisma.logAuditoria.create({ data: this.montarDados(entrada), select: { id: true } });
    } catch (erro) {
      this.logger.error(
        `Falha ao gravar auditoria da acao ${entrada.acao}.`,
        erro instanceof Error ? erro.stack : String(erro),
      );
    }
  }

  /**
   * Grava dentro de uma transacao ja aberta. Aqui o erro propaga de proposito:
   * se a auditoria da operacao critica falhar, a operacao toda volta atras.
   */
  async registrarNaTransacao(
    tx: { logAuditoria: { create: (args: unknown) => Promise<unknown> } },
    entrada: EntradaAuditoria,
  ): Promise<void> {
    await tx.logAuditoria.create({ data: this.montarDados(entrada), select: { id: true } });
  }

  /**
   * Monta a linha do log. Os campos antes e depois sao omitidos quando nao ha
   * nada registravel: a coluna Json e nullable e o Prisma exige um marcador
   * explicito para gravar NULL, enquanto a ausencia do campo ja cai no padrao.
   */
  private montarDados(entrada: EntradaAuditoria): DadosLogAuditoria {
    const antes = sanitizar(entrada.antes);
    const depois = sanitizar(entrada.depois);

    return {
      usuarioId: entrada.usuarioId ?? null,
      acao: entrada.acao,
      entidade: entrada.entidade,
      entidadeId: entrada.entidadeId ?? null,
      ...(antes ? { antes } : {}),
      ...(depois ? { depois } : {}),
      ip: entrada.origem?.ip?.slice(0, TAMANHO_MAXIMO_IP) ?? null,
      userAgent: entrada.origem?.userAgent?.slice(0, TAMANHO_MAXIMO_USER_AGENT) ?? null,
    };
  }
}
