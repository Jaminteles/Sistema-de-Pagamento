-- RF-017: o historico de ajuste passa a pertencer ao dia de ponto.
--
-- Antes o registro vivia pendurado na marcacao com ON DELETE CASCADE: apagar
-- uma batida errada - que e um ajuste como qualquer outro - levava embora a
-- prova de que ela existiu. Agora o dono e o dia_ponto, a marcacao fica
-- opcional (SET NULL) e `campo` guarda o que foi alterado, inclusive a troca de
-- ocorrencia e de observacao do dia.
--
-- Migration aditiva: nenhuma linha de ponto ou de pagamento e removida.

-- CreateEnum
CREATE TYPE "campo_ajuste" AS ENUM ('ENTRADA', 'SAIDA_INTERVALO', 'RETORNO_INTERVALO', 'SAIDA', 'OCORRENCIA', 'OBSERVACAO');

-- AlterTable: colunas novas entram anulaveis para o backfill poder rodar.
ALTER TABLE "ajuste_ponto" ADD COLUMN "dia_ponto_id" UUID;
ALTER TABLE "ajuste_ponto" ADD COLUMN "campo" "campo_ajuste";
ALTER TABLE "ajuste_ponto" ADD COLUMN "texto_anterior" VARCHAR(500);
ALTER TABLE "ajuste_ponto" ADD COLUMN "texto_novo" VARCHAR(500);

-- Backfill a partir da marcacao de origem, que ate aqui era obrigatoria.
UPDATE "ajuste_ponto" AS a
SET "dia_ponto_id" = m."dia_ponto_id",
    "campo" = m."tipo"::text::"campo_ajuste"
FROM "marcacao" AS m
WHERE m."id" = a."marcacao_id"
  AND a."dia_ponto_id" IS NULL;

-- Registro orfao nao deveria existir (a FK era obrigatoria); se existir, sai
-- do caminho antes do NOT NULL, com o motivo visivel no log da migration.
DELETE FROM "ajuste_ponto" WHERE "dia_ponto_id" IS NULL;

ALTER TABLE "ajuste_ponto" ALTER COLUMN "dia_ponto_id" SET NOT NULL;
ALTER TABLE "ajuste_ponto" ALTER COLUMN "campo" SET NOT NULL;
ALTER TABLE "ajuste_ponto" ALTER COLUMN "marcacao_id" DROP NOT NULL;

-- DropForeignKey / AddForeignKey: cascade da marcacao vira SET NULL.
ALTER TABLE "ajuste_ponto" DROP CONSTRAINT "ajuste_ponto_marcacao_id_fkey";
ALTER TABLE "ajuste_ponto" ADD CONSTRAINT "ajuste_ponto_marcacao_id_fkey" FOREIGN KEY ("marcacao_id") REFERENCES "marcacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ajuste_ponto" ADD CONSTRAINT "ajuste_ponto_dia_ponto_id_fkey" FOREIGN KEY ("dia_ponto_id") REFERENCES "dia_ponto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ajuste_ponto_dia_ponto_id_criado_em_idx" ON "ajuste_ponto"("dia_ponto_id", "criado_em");
