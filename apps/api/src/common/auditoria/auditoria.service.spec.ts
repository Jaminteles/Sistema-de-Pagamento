import { AcaoAuditoria } from '@sistema/shared';
import type { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from './auditoria.service';

/**
 * O log de auditoria (RF-005) e prova de quem fez o que. Estes testes cobrem as
 * duas garantias que ele precisa dar: nunca gravar dado sensivel e nunca
 * derrubar a operacao de negocio quando a gravacao falha.
 */
describe('AuditoriaService', () => {
  let create: jest.Mock;
  let servico: AuditoriaService;

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({ id: 'log-1' });
    const prisma = { logAuditoria: { create } } as unknown as PrismaService;
    servico = new AuditoriaService(prisma);
  });

  function dadosGravados(): Record<string, unknown> {
    const chamadas = create.mock.calls as unknown as { data: Record<string, unknown> }[][];
    return chamadas[0]?.[0]?.data ?? {};
  }

  it('grava a acao com autor, entidade e origem', async () => {
    await servico.registrar({
      usuarioId: 'u-1',
      acao: AcaoAuditoria.USUARIO_CRIADO,
      entidade: 'usuario',
      entidadeId: 'u-2',
      depois: { perfil: 'RH' },
      origem: { ip: '203.0.113.10', userAgent: 'jest' },
    });

    expect(dadosGravados()).toMatchObject({
      usuarioId: 'u-1',
      acao: AcaoAuditoria.USUARIO_CRIADO,
      entidade: 'usuario',
      entidadeId: 'u-2',
      depois: { perfil: 'RH' },
      ip: '203.0.113.10',
      userAgent: 'jest',
    });
  });

  it('remove senha, hash, token, CPF e chave Pix do que for gravado', async () => {
    await servico.registrar({
      usuarioId: 'u-1',
      acao: AcaoAuditoria.FUNCIONARIO_DADOS_PAGAMENTO_ALTERADO,
      entidade: 'dados_pagamento',
      depois: {
        senha: 'senha-em-claro',
        senhaHash: '$argon2id$...',
        refreshToken: 'token',
        cpf: '12345678901',
        chavePix: 'fulano@email.com',
        conta: '123456-7',
        tipoChave: 'EMAIL',
      },
    });

    const gravado = dadosGravados();
    const serializado = JSON.stringify(gravado);

    expect(gravado.depois).toEqual({ tipoChave: 'EMAIL' });
    expect(serializado).not.toContain('senha-em-claro');
    expect(serializado).not.toContain('argon2id');
    expect(serializado).not.toContain('12345678901');
    expect(serializado).not.toContain('fulano@email.com');
  });

  it('omite antes e depois quando sobra apenas campo proibido', async () => {
    await servico.registrar({
      acao: AcaoAuditoria.LOGIN,
      entidade: 'usuario',
      depois: { token: 'abc' },
    });

    const gravado = dadosGravados();
    expect(gravado).not.toHaveProperty('depois');
    expect(gravado).not.toHaveProperty('antes');
  });

  it('nao propaga erro de gravacao: auditoria nao derruba a operacao', async () => {
    create.mockRejectedValue(new Error('banco fora'));

    await expect(
      servico.registrar({ acao: AcaoAuditoria.LOGIN, entidade: 'usuario' }),
    ).resolves.toBeUndefined();
  });

  it('propaga o erro quando a gravacao e parte de uma transacao', async () => {
    const tx = { logAuditoria: { create: jest.fn().mockRejectedValue(new Error('rollback')) } };

    await expect(
      servico.registrarNaTransacao(tx, { acao: AcaoAuditoria.LOTE_APROVADO, entidade: 'lote' }),
    ).rejects.toThrow('rollback');
  });
});
