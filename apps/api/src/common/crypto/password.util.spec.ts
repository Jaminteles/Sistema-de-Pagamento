import { conferirSenha, gerarHashSenha, SENHA_TAMANHO_MINIMO } from './password.util';

describe('password.util', () => {
  // argon2 e proposital e deliberadamente lento.
  jest.setTimeout(20000);

  it('gera hash argon2id e nunca devolve a senha em claro', async () => {
    const senha = 'senha-de-teste-123';

    const hash = await gerarHashSenha(senha);

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain(senha);
  });

  it('gera hashes diferentes para a mesma senha (salt aleatorio)', async () => {
    const senha = 'senha-de-teste-123';

    const [primeiro, segundo] = await Promise.all([gerarHashSenha(senha), gerarHashSenha(senha)]);

    expect(primeiro).not.toBe(segundo);
  });

  it('confere a senha correta', async () => {
    const senha = 'senha-de-teste-123';
    const hash = await gerarHashSenha(senha);

    await expect(conferirSenha(hash, senha)).resolves.toBe(true);
  });

  it('rejeita senha errada', async () => {
    const hash = await gerarHashSenha('senha-de-teste-123');

    await expect(conferirSenha(hash, 'senha-de-teste-124')).resolves.toBe(false);
  });

  it('rejeita hash em formato desconhecido sem lancar excecao', async () => {
    await expect(conferirSenha('nao-e-um-hash', 'senha-de-teste-123')).resolves.toBe(false);
  });

  it('recusa senha abaixo do tamanho minimo', async () => {
    const curta = 'a'.repeat(SENHA_TAMANHO_MINIMO - 1);

    await expect(gerarHashSenha(curta)).rejects.toThrow(String(SENHA_TAMANHO_MINIMO));
  });
});
