-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "perfil_usuario" AS ENUM ('ADMIN', 'RH', 'ENCARREGADO', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "situacao_funcionario" AS ENUM ('ATIVO', 'AFASTADO', 'DESLIGADO');

-- CreateEnum
CREATE TYPE "tipo_chave_pix" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA');

-- CreateEnum
CREATE TYPE "abrangencia_feriado" AS ENUM ('NACIONAL', 'ESTADUAL', 'MUNICIPAL');

-- CreateEnum
CREATE TYPE "status_periodo" AS ENUM ('ABERTO', 'EM_CONFERENCIA', 'FECHADO');

-- CreateEnum
CREATE TYPE "ocorrencia_dia" AS ENUM ('NORMAL', 'FALTA', 'FALTA_JUSTIFICADA', 'ATESTADO', 'FOLGA', 'FERIAS', 'AFASTAMENTO');

-- CreateEnum
CREATE TYPE "status_envio_dia" AS ENUM ('NAO_ENVIADO', 'ENVIADO_RH', 'CONFERIDO');

-- CreateEnum
CREATE TYPE "tipo_marcacao" AS ENUM ('ENTRADA', 'SAIDA_INTERVALO', 'RETORNO_INTERVALO', 'SAIDA');

-- CreateEnum
CREATE TYPE "origem_marcacao" AS ENUM ('MANUAL', 'IMPORTADO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "tipo_valor_pagar" AS ENUM ('SALARIO', 'ADIANTAMENTO', 'DIARIA', 'AJUDA_CUSTO', 'OUTROS');

-- CreateEnum
CREATE TYPE "origem_valor_pagar" AS ENUM ('IMPORTADO', 'AVULSO');

-- CreateEnum
CREATE TYPE "status_lote_pagamento" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'EM_ENVIO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "status_lote_item" AS ENUM ('PENDENTE', 'ENVIADO', 'PAGO', 'FALHOU', 'DEVOLVIDO');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "senha_hash" VARCHAR(255) NOT NULL,
    "perfil" "perfil_usuario" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "senha_alterada_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_obra" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "obra_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obra" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "endereco" VARCHAR(255),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornada" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "entrada_minutos" INTEGER NOT NULL,
    "saida_minutos" INTEGER NOT NULL,
    "intervalo_minutos" INTEGER NOT NULL,
    "carga_semanal_minutos" INTEGER NOT NULL,
    "tolerancia_minutos" INTEGER NOT NULL DEFAULT 10,
    "dias_semana" INTEGER[],
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jornada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funcionario" (
    "id" UUID NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "matricula" VARCHAR(30) NOT NULL,
    "cargo" VARCHAR(120),
    "admissao" DATE NOT NULL,
    "desligamento" DATE,
    "situacao" "situacao_funcionario" NOT NULL DEFAULT 'ATIVO',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "funcionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dados_pagamento" (
    "id" UUID NOT NULL,
    "funcionario_id" UUID NOT NULL,
    "tipo_chave" "tipo_chave_pix",
    "chave_pix_criptografada" TEXT,
    "chave_pix_mascara" VARCHAR(40),
    "banco" VARCHAR(10),
    "agencia" VARCHAR(10),
    "conta_criptografada" TEXT,
    "conta_mascara" VARCHAR(40),
    "validado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dados_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vinculo_funcionario" (
    "id" UUID NOT NULL,
    "funcionario_id" UUID NOT NULL,
    "obra_id" UUID NOT NULL,
    "jornada_id" UUID NOT NULL,
    "inicio_vigencia" DATE NOT NULL,
    "fim_vigencia" DATE,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vinculo_funcionario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feriado" (
    "id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "descricao" VARCHAR(160) NOT NULL,
    "abrangencia" "abrangencia_feriado" NOT NULL,
    "uf" CHAR(2),
    "municipio" VARCHAR(120),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feriado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodo" (
    "id" UUID NOT NULL,
    "competencia" CHAR(7) NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "status" "status_periodo" NOT NULL DEFAULT 'ABERTO',
    "fechado_em" TIMESTAMPTZ(3),
    "fechado_por_id" UUID,
    "reaberto_em" TIMESTAMPTZ(3),
    "reaberto_por_id" UUID,
    "motivo_reabertura" VARCHAR(500),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dia_ponto" (
    "id" UUID NOT NULL,
    "periodo_id" UUID NOT NULL,
    "funcionario_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "ocorrencia" "ocorrencia_dia" NOT NULL DEFAULT 'NORMAL',
    "status_envio" "status_envio_dia" NOT NULL DEFAULT 'NAO_ENVIADO',
    "minutos_trabalhados" INTEGER NOT NULL DEFAULT 0,
    "minutos_extras_50" INTEGER NOT NULL DEFAULT 0,
    "minutos_extras_100" INTEGER NOT NULL DEFAULT 0,
    "minutos_noturnos" INTEGER NOT NULL DEFAULT 0,
    "minutos_atraso" INTEGER NOT NULL DEFAULT 0,
    "minutos_falta" INTEGER NOT NULL DEFAULT 0,
    "apurado_em" TIMESTAMPTZ(3),
    "observacao" VARCHAR(500),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dia_ponto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcacao" (
    "id" UUID NOT NULL,
    "dia_ponto_id" UUID NOT NULL,
    "horario" TIMESTAMPTZ(3) NOT NULL,
    "tipo" "tipo_marcacao" NOT NULL,
    "origem" "origem_marcacao" NOT NULL DEFAULT 'MANUAL',
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "marcacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajuste_ponto" (
    "id" UUID NOT NULL,
    "marcacao_id" UUID NOT NULL,
    "valor_anterior" TIMESTAMPTZ(3),
    "valor_novo" TIMESTAMPTZ(3),
    "justificativa" VARCHAR(500) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ajuste_ponto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valor_pagar" (
    "id" UUID NOT NULL,
    "funcionario_id" UUID NOT NULL,
    "periodo_id" UUID,
    "tipo" "tipo_valor_pagar" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "origem" "origem_valor_pagar" NOT NULL,
    "descricao" VARCHAR(255),
    "criado_por_id" UUID NOT NULL,
    "lote_item_id" UUID,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "valor_pagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote_pagamento" (
    "id" UUID NOT NULL,
    "descricao" VARCHAR(255) NOT NULL,
    "status" "status_lote_pagamento" NOT NULL DEFAULT 'RASCUNHO',
    "criado_por_id" UUID NOT NULL,
    "aprovado_por_id" UUID,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "aprovado_em" TIMESTAMPTZ(3),
    "enviado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lote_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote_item" (
    "id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "funcionario_id" UUID NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "chave_pix_criptografada" TEXT,
    "chave_pix_mascara" VARCHAR(40),
    "status" "status_lote_item" NOT NULL DEFAULT 'PENDENTE',
    "id_banco" VARCHAR(80),
    "e2e_id" VARCHAR(40),
    "idempotency_key" VARCHAR(80) NOT NULL,
    "erro" VARCHAR(500),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "enviado_em" TIMESTAMPTZ(3),
    "pago_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lote_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_auditoria" (
    "id" UUID NOT NULL,
    "usuario_id" UUID,
    "acao" VARCHAR(80) NOT NULL,
    "entidade" VARCHAR(80) NOT NULL,
    "entidade_id" VARCHAR(80),
    "antes" JSONB,
    "depois" JSONB,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(255),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "usuario_perfil_ativo_idx" ON "usuario"("perfil", "ativo");

-- CreateIndex
CREATE INDEX "usuario_obra_obra_id_idx" ON "usuario_obra"("obra_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_obra_usuario_id_obra_id_key" ON "usuario_obra"("usuario_id", "obra_id");

-- CreateIndex
CREATE UNIQUE INDEX "obra_nome_key" ON "obra"("nome");

-- CreateIndex
CREATE INDEX "obra_ativa_idx" ON "obra"("ativa");

-- CreateIndex
CREATE UNIQUE INDEX "jornada_nome_key" ON "jornada"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "funcionario_cpf_key" ON "funcionario"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "funcionario_matricula_key" ON "funcionario"("matricula");

-- CreateIndex
CREATE INDEX "funcionario_situacao_idx" ON "funcionario"("situacao");

-- CreateIndex
CREATE INDEX "funcionario_nome_idx" ON "funcionario"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "dados_pagamento_funcionario_id_key" ON "dados_pagamento"("funcionario_id");

-- CreateIndex
CREATE INDEX "vinculo_funcionario_funcionario_id_inicio_vigencia_idx" ON "vinculo_funcionario"("funcionario_id", "inicio_vigencia");

-- CreateIndex
CREATE INDEX "vinculo_funcionario_obra_id_inicio_vigencia_idx" ON "vinculo_funcionario"("obra_id", "inicio_vigencia");

-- CreateIndex
CREATE INDEX "feriado_data_idx" ON "feriado"("data");

-- CreateIndex
CREATE UNIQUE INDEX "feriado_data_descricao_key" ON "feriado"("data", "descricao");

-- CreateIndex
CREATE UNIQUE INDEX "periodo_competencia_key" ON "periodo"("competencia");

-- CreateIndex
CREATE INDEX "periodo_status_idx" ON "periodo"("status");

-- CreateIndex
CREATE INDEX "dia_ponto_periodo_id_data_idx" ON "dia_ponto"("periodo_id", "data");

-- CreateIndex
CREATE INDEX "dia_ponto_periodo_id_status_envio_idx" ON "dia_ponto"("periodo_id", "status_envio");

-- CreateIndex
CREATE UNIQUE INDEX "dia_ponto_funcionario_id_data_key" ON "dia_ponto"("funcionario_id", "data");

-- CreateIndex
CREATE INDEX "marcacao_dia_ponto_id_horario_idx" ON "marcacao"("dia_ponto_id", "horario");

-- CreateIndex
CREATE UNIQUE INDEX "marcacao_dia_ponto_id_tipo_key" ON "marcacao"("dia_ponto_id", "tipo");

-- CreateIndex
CREATE INDEX "ajuste_ponto_marcacao_id_criado_em_idx" ON "ajuste_ponto"("marcacao_id", "criado_em");

-- CreateIndex
CREATE INDEX "valor_pagar_periodo_id_funcionario_id_idx" ON "valor_pagar"("periodo_id", "funcionario_id");

-- CreateIndex
CREATE INDEX "valor_pagar_lote_item_id_idx" ON "valor_pagar"("lote_item_id");

-- CreateIndex
CREATE INDEX "lote_pagamento_status_criado_em_idx" ON "lote_pagamento"("status", "criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "lote_item_idempotency_key_key" ON "lote_item"("idempotency_key");

-- CreateIndex
CREATE INDEX "lote_item_lote_id_status_idx" ON "lote_item"("lote_id", "status");

-- CreateIndex
CREATE INDEX "lote_item_funcionario_id_idx" ON "lote_item"("funcionario_id");

-- CreateIndex
CREATE INDEX "lote_item_e2e_id_idx" ON "lote_item"("e2e_id");

-- CreateIndex
CREATE INDEX "log_auditoria_entidade_entidade_id_idx" ON "log_auditoria"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "log_auditoria_usuario_id_criado_em_idx" ON "log_auditoria"("usuario_id", "criado_em");

-- CreateIndex
CREATE INDEX "log_auditoria_criado_em_idx" ON "log_auditoria"("criado_em");

-- AddForeignKey
ALTER TABLE "usuario_obra" ADD CONSTRAINT "usuario_obra_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_obra" ADD CONSTRAINT "usuario_obra_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dados_pagamento" ADD CONSTRAINT "dados_pagamento_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculo_funcionario" ADD CONSTRAINT "vinculo_funcionario_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculo_funcionario" ADD CONSTRAINT "vinculo_funcionario_obra_id_fkey" FOREIGN KEY ("obra_id") REFERENCES "obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculo_funcionario" ADD CONSTRAINT "vinculo_funcionario_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodo" ADD CONSTRAINT "periodo_fechado_por_id_fkey" FOREIGN KEY ("fechado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodo" ADD CONSTRAINT "periodo_reaberto_por_id_fkey" FOREIGN KEY ("reaberto_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dia_ponto" ADD CONSTRAINT "dia_ponto_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dia_ponto" ADD CONSTRAINT "dia_ponto_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcacao" ADD CONSTRAINT "marcacao_dia_ponto_id_fkey" FOREIGN KEY ("dia_ponto_id") REFERENCES "dia_ponto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_ponto" ADD CONSTRAINT "ajuste_ponto_marcacao_id_fkey" FOREIGN KEY ("marcacao_id") REFERENCES "marcacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajuste_ponto" ADD CONSTRAINT "ajuste_ponto_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valor_pagar" ADD CONSTRAINT "valor_pagar_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valor_pagar" ADD CONSTRAINT "valor_pagar_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valor_pagar" ADD CONSTRAINT "valor_pagar_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valor_pagar" ADD CONSTRAINT "valor_pagar_lote_item_id_fkey" FOREIGN KEY ("lote_item_id") REFERENCES "lote_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_pagamento" ADD CONSTRAINT "lote_pagamento_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_pagamento" ADD CONSTRAINT "lote_pagamento_aprovado_por_id_fkey" FOREIGN KEY ("aprovado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_item" ADD CONSTRAINT "lote_item_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lote_pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_item" ADD CONSTRAINT "lote_item_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Regras que o Prisma nao modela: check constraints e indices parciais.
-- Ficam aqui, dentro do controle das migrations, e nunca em .sql solto.
-- ---------------------------------------------------------------------------

-- RF-006: CPF guardado apenas com digitos; desligamento nunca antes da admissao.
ALTER TABLE "funcionario"
  ADD CONSTRAINT "funcionario_cpf_digitos" CHECK ("cpf" ~ '^[0-9]{11}$'),
  ADD CONSTRAINT "funcionario_desligamento_apos_admissao"
    CHECK ("desligamento" IS NULL OR "desligamento" >= "admissao");

-- RN-08: so entra em lote quem tem chave Pix OU conta completa.
-- A chave e a conta ficam criptografadas (RNF-04); aqui validamos apenas a
-- presenca dos campos.
ALTER TABLE "dados_pagamento"
  ADD CONSTRAINT "dados_pagamento_pix_ou_conta" CHECK (
    ("tipo_chave" IS NOT NULL AND "chave_pix_criptografada" IS NOT NULL)
    OR (
      "banco" IS NOT NULL
      AND "agencia" IS NOT NULL
      AND "conta_criptografada" IS NOT NULL
    )
  );

-- RF-009: horarios em minutos a partir da meia-noite; carga e tolerancia nao negativas.
ALTER TABLE "jornada"
  ADD CONSTRAINT "jornada_entrada_valida" CHECK ("entrada_minutos" BETWEEN 0 AND 1440),
  ADD CONSTRAINT "jornada_saida_valida" CHECK ("saida_minutos" BETWEEN 0 AND 1440),
  ADD CONSTRAINT "jornada_intervalo_valido" CHECK ("intervalo_minutos" BETWEEN 0 AND 1440),
  ADD CONSTRAINT "jornada_carga_valida" CHECK ("carga_semanal_minutos" BETWEEN 0 AND 10080),
  ADD CONSTRAINT "jornada_tolerancia_valida" CHECK ("tolerancia_minutos" BETWEEN 0 AND 120),
  ADD CONSTRAINT "jornada_dias_semana_preenchidos" CHECK (array_length("dias_semana", 1) > 0);

-- RF-010: vigencia coerente e, por funcionario, apenas um vinculo aberto.
ALTER TABLE "vinculo_funcionario"
  ADD CONSTRAINT "vinculo_vigencia_coerente"
    CHECK ("fim_vigencia" IS NULL OR "fim_vigencia" >= "inicio_vigencia");

CREATE UNIQUE INDEX "vinculo_funcionario_um_aberto_por_funcionario"
  ON "vinculo_funcionario" ("funcionario_id")
  WHERE "fim_vigencia" IS NULL;

-- RF-011: abrangencia estadual exige UF; municipal exige UF e municipio.
ALTER TABLE "feriado"
  ADD CONSTRAINT "feriado_abrangencia_coerente" CHECK (
    ("abrangencia" = 'NACIONAL')
    OR ("abrangencia" = 'ESTADUAL' AND "uf" IS NOT NULL)
    OR ("abrangencia" = 'MUNICIPAL' AND "uf" IS NOT NULL AND "municipio" IS NOT NULL)
  );

-- RN-01 e RN-07: competencia AAAA-MM, periodo coerente e reabertura com motivo.
ALTER TABLE "periodo"
  ADD CONSTRAINT "periodo_competencia_formato"
    CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "periodo_datas_coerentes" CHECK ("data_fim" >= "data_inicio"),
  ADD CONSTRAINT "periodo_fechamento_registrado" CHECK (
    ("status" <> 'FECHADO')
    OR ("fechado_em" IS NOT NULL AND "fechado_por_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "periodo_reabertura_com_motivo" CHECK (
    "reaberto_em" IS NULL
    OR ("motivo_reabertura" IS NOT NULL AND btrim("motivo_reabertura") <> '' AND "reaberto_por_id" IS NOT NULL)
  );

-- RF-020: totais apurados sempre em minutos inteiros nao negativos.
ALTER TABLE "dia_ponto"
  ADD CONSTRAINT "dia_ponto_minutos_nao_negativos" CHECK (
    "minutos_trabalhados" >= 0
    AND "minutos_extras_50" >= 0
    AND "minutos_extras_100" >= 0
    AND "minutos_noturnos" >= 0
    AND "minutos_atraso" >= 0
    AND "minutos_falta" >= 0
  );

-- RF-017: justificativa de ajuste nunca em branco.
ALTER TABLE "ajuste_ponto"
  ADD CONSTRAINT "ajuste_ponto_justificativa_preenchida"
    CHECK (btrim("justificativa") <> '');

-- RF-027 e RF-028: valor a pagar sempre positivo (descontos ficam com o contador).
ALTER TABLE "valor_pagar"
  ADD CONSTRAINT "valor_pagar_positivo" CHECK ("valor" > 0);

-- RN-09: quem monta o lote nao pode aprova-lo.
-- RN-10: lote aprovado registra aprovador e data.
ALTER TABLE "lote_pagamento"
  ADD CONSTRAINT "lote_aprovador_diferente_do_montador"
    CHECK ("aprovado_por_id" IS NULL OR "aprovado_por_id" <> "criado_por_id"),
  ADD CONSTRAINT "lote_total_nao_negativo" CHECK ("total" >= 0),
  ADD CONSTRAINT "lote_aprovacao_registrada" CHECK (
    "status" NOT IN ('APROVADO', 'EM_ENVIO', 'CONCLUIDO')
    OR ("aprovado_por_id" IS NOT NULL AND "aprovado_em" IS NOT NULL)
  );

-- RN-11: item so fica PAGO com confirmacao do banco (data e identificador E2E).
-- RNF-07: a chave de idempotencia nunca fica em branco.
ALTER TABLE "lote_item"
  ADD CONSTRAINT "lote_item_valor_positivo" CHECK ("valor" > 0),
  ADD CONSTRAINT "lote_item_tentativas_nao_negativas" CHECK ("tentativas" >= 0),
  ADD CONSTRAINT "lote_item_idempotency_key_preenchida"
    CHECK (btrim("idempotency_key") <> ''),
  ADD CONSTRAINT "lote_item_pago_confirmado_pelo_banco" CHECK (
    "status" <> 'PAGO'
    OR ("pago_em" IS NOT NULL AND "e2e_id" IS NOT NULL)
  );
