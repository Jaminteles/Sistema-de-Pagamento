# Sistema de Ponto e Pagamento

Registro de ponto, apuração de horas e pagamento de funcionários via Pix pela API do banco.
Substituto enxuto do SGE, para **uma única empresa**.

Requisitos, regras de negócio e perfis: [docs/Levantamento de Requisitos — Sistema de Ponto e Pagamento.md](docs/Levantamento%20de%20Requisitos%20%E2%80%94%20Sistema%20de%20Ponto%20e%20Pagamento.md).

> O funcionário **não** é usuário do sistema. Não existe login, tela ou endpoint de
> autoatendimento para funcionário.

## Estrutura

```
apps/api         API NestJS + Prisma (PostgreSQL 16)
apps/web         Front-end Angular + Angular Material
packages/shared  Enums e contratos de API usados pelos dois lados
```

## Pré-requisitos

| Ferramenta | Versão             |
| ---------- | ------------------ |
| Node.js    | 24.19.0 ou maior   |
| pnpm       | 12.9.1             |
| Docker     | com Docker Compose |

```bash
corepack enable pnpm
```

## Primeira execução

```bash
cp .env.example .env
```

Preencha o `.env` (senha do banco, `CORS_ORIGIN` e as variáveis de seed). O `.env` nunca é
versionado.

```bash
pnpm install
```

```bash
pnpm run build:shared
```

`@sistema/shared` é compilado antes de api e web, porque os dois consomem o `dist`.

### Portas

O Compose publica o Postgres em `POSTGRES_PORT` e o front em `WEB_PORT`. Se a maquina ja
tiver um PostgreSQL nativo em 5432 ou algo na 3000, troque a porta no `.env` e ajuste a
`DATABASE_URL`.

### Banco de dados

Sobe apenas o PostgreSQL:

```bash
docker compose up -d postgres
```

Aplica as migrations e gera o client:

```bash
pnpm --filter @sistema/api exec prisma migrate deploy
```

```bash
pnpm --filter @sistema/api prisma:generate
```

Cria o usuário administrador (idempotente, usa `SEED_ADMIN_*` do `.env`):

```bash
pnpm --filter @sistema/api prisma:seed
```

### Desenvolvimento

API em `http://localhost:3000` (Swagger em `/api/docs`):

```bash
pnpm --filter @sistema/api start:dev
```

Front-end em `http://localhost:4200`, com proxy de `/api` para a API:

```bash
pnpm --filter @sistema/web start
```

## Validação

Rode **um comando por vez**: a máquina de desenvolvimento não deve executar testes, lint e
build em paralelo.

```bash
pnpm run lint:api
```

```bash
pnpm run test:api
```

```bash
pnpm run test:web
```

```bash
pnpm run build:web
```

O mesmo encadeamento, na ordem usada pela CI, está em `pnpm run ci:verify`.

## Produção (Docker Compose)

```bash
docker compose up -d --build
```

O Nginx serve o front e encaminha `/api` para a API, então as duas pontas ficam na mesma
origem. Front em `http://localhost:${WEB_PORT}`.

## Convenções que não se negociam

- **Prisma é a fonte de verdade do schema.** Toda mudança estrutural nasce em
  `apps/api/prisma/schema.prisma`; check constraints e índices parciais ficam no
  `migration.sql` da migration correspondente. Nunca crie `.sql` solto.
- **Dinheiro**: `numeric(12,2)` no banco → `Prisma.Decimal` no código → `string` no JSON →
  formatado em BRL só na exibição. Nunca `number`/float.
- **Durações** (horas trabalhadas, extras, atrasos, banco de horas) em **minutos inteiros**.
- **Timestamps** em `timestamptz`; fuso de negócio `America/Bahia` aplicado na apuração e na
  exibição. Dia de ponto e vigências são `date`.
- **Autorização sempre no back-end**: guard de JWT + guard de perfil em todo endpoint. O
  escopo do encarregado sai do usuário autenticado, nunca de parâmetro do front.
- **Token de acesso em memória** no front; refresh token em cookie `httpOnly`. Nunca
  `localStorage` ou `sessionStorage`.
- Empresa única: não existe `empresa_id`, `filial_id` nem multiempresa.
- Certificados e segredos (`.pem`, `.p12`, `.pfx`, `.key`, `.env`) ficam fora do repositório.
- Testes automatizados nunca chamam a API real do banco.
