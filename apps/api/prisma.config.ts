import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, env } from 'prisma/config';

// O Prisma 7 nao le mais o .env automaticamente. Carregamos o .env da raiz do
// monorepo (quando existe) usando o proprio Node, sem dependencia extra.
// Em producao as variaveis chegam pelo ambiente e nenhum arquivo e lido.
for (const caminho of [resolve(__dirname, '.env'), resolve(__dirname, '../../.env')]) {
  if (existsSync(caminho)) {
    process.loadEnvFile(caminho);
    break;
  }
}

/**
 * Configuracao do CLI do Prisma. A URL de conexao fica aqui (e nao no
 * schema.prisma) e vem sempre do ambiente: nenhuma credencial no repositorio.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
});
