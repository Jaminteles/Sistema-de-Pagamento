/**
 * Seed inicial (T-004): cria o usuario ADMIN que abre o sistema.
 *
 * Nenhuma credencial fica no codigo: e-mail, nome e senha vem do ambiente.
 * O seed e idempotente - rodar de novo nao duplica nem sobrescreve a senha de
 * um admin ja existente.
 *
 * Uso:
 *   SEED_ADMIN_EMAIL=... SEED_ADMIN_NOME=... SEED_ADMIN_SENHA=... pnpm --filter @sistema/api prisma:seed
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PerfilUsuario } from '../src/generated/prisma/enums';
import { PrismaClient } from '../src/generated/prisma/client';
import { gerarHashSenha, SENHA_TAMANHO_MINIMO } from '../src/common/crypto/password.util';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Variavel de ambiente DATABASE_URL e obrigatoria para rodar o seed.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function lerVariavel(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    throw new Error(`Variavel de ambiente ${nome} e obrigatoria para rodar o seed.`);
  }
  return valor;
}

async function main(): Promise<void> {
  const email = lerVariavel('SEED_ADMIN_EMAIL').toLowerCase();
  const nome = lerVariavel('SEED_ADMIN_NOME');
  const senha = lerVariavel('SEED_ADMIN_SENHA');

  if (senha.length < SENHA_TAMANHO_MINIMO) {
    throw new Error(`SEED_ADMIN_SENHA precisa de pelo menos ${SENHA_TAMANHO_MINIMO} caracteres.`);
  }

  const existente = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });

  if (existente) {
    // Nao sobrescreve a senha de um admin em uso.
    console.warn(`Admin ja cadastrado (${mascararEmail(email)}). Nada a fazer.`);
    return;
  }

  const senhaHash = await gerarHashSenha(senha);

  await prisma.usuario.create({
    data: {
      nome,
      email,
      senhaHash,
      perfil: PerfilUsuario.ADMIN,
      ativo: true,
    },
    select: { id: true },
  });

  console.warn(`Admin criado: ${mascararEmail(email)}`);
}

/** Evita gravar o e-mail completo na saida do seed. */
function mascararEmail(email: string): string {
  const [local = '', dominio = ''] = email.split('@');
  const visivel = local.slice(0, 2);
  return `${visivel}${'*'.repeat(Math.max(local.length - 2, 1))}@${dominio}`;
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : String(erro));
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
