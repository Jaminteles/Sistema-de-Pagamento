-- Sessao de refresh token (T-008 / RF-001).
--
-- Migration aditiva: cria somente a tabela sessao_refresh. Nenhum dado de ponto
-- ou de pagamento e tocado.
--
-- A tabela guarda apenas o SHA-256 do refresh token; o valor em claro fica
-- exclusivamente no cookie httpOnly do navegador.

-- CreateTable
CREATE TABLE "sessao_refresh" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "revogada_em" TIMESTAMPTZ(3),
    "motivo" VARCHAR(40),
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessao_refresh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessao_refresh_token_hash_key" ON "sessao_refresh"("token_hash");

-- CreateIndex
CREATE INDEX "sessao_refresh_usuario_id_revogada_em_idx" ON "sessao_refresh"("usuario_id", "revogada_em");

-- CreateIndex
CREATE INDEX "sessao_refresh_expira_em_idx" ON "sessao_refresh"("expira_em");

-- AddForeignKey
ALTER TABLE "sessao_refresh" ADD CONSTRAINT "sessao_refresh_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
