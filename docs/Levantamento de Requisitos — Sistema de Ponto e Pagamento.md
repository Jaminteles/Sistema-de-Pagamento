# **Levantamento de Requisitos — Sistema de Ponto e Pagamento**

Oct 6, 2026 · @Jamínteles Desus Ribeiro Moura
Sprints: https://docs.google.com/spreadsheets/d/1KiN--NnKjRTgbBVKQXIqKEj1sDcwJk-RRWlCGr9mQqk/edit?gid=2049546554#gid=2049546554

## **1\. Visão geral**

O sistema registra o ponto dos funcionários, fecha o período e paga os valores via Pix pela API do banco. É um substituto enxuto do SGE.

**Objetivo:** reduzir o trabalho do RH e do financeiro em três tarefas: lançar o ponto, apurar as horas e pagar.

**Princípio de escopo:** todo requisito precisa servir ao ponto ou ao pagamento. O que não serve fica fora.

**Usuários:** encarregado de obra, RH, financeiro e administrador. O funcionário não acessa o sistema; ele recebe no máximo o espelho de ponto exportado em PDF.

## **2\. Escopo**

O MVP cobre cadastro, lançamento de ponto, fechamento, importação de líquidos e pagamento via Pix. Cálculo de folha fica com o contador.

| Dentro do escopo                                            | Fora do escopo                                          |
| :---------------------------------------------------------- | :------------------------------------------------------ |
| Cadastro de funcionários, obras/setores e jornadas          | Acesso do funcionário ao sistema (app, autoatendimento) |
| Lançamento de ponto pelo encarregado ou RH                  | Relógio de ponto, biometria, reconhecimento facial      |
| Ajustes de ponto com justificativa e trilha de auditoria    | Cálculo de INSS, IRRF, FGTS, férias, 13º e rescisão     |
| Apuração de horas, extras, faltas, atrasos e banco de horas | eSocial e obrigações acessórias                         |
| Espelho de ponto em PDF e exportação para o contador        | Contabilidade, contas a pagar/receber gerais, estoque   |
| Importação dos valores líquidos (CSV/XLSX)                  | Multiempresa                                            |
| Lotes de pagamento com aprovação e envio Pix via API        | Conciliação bancária completa                           |
| Status, comprovantes e histórico de pagamentos              | Pagamento por TED/boleto (fica para depois do MVP)      |
| Pagamentos avulsos (adiantamento, diária)                   |                                                         |

## **3\. Perfis de usuário e permissões**

Quatro perfis. O encarregado só vê os funcionários das obras/setores dele; o funcionário não tem login.

| Ação                                                 | Admin | RH          | Encarregado                 | Financeiro |
| :--------------------------------------------------- | :---- | :---------- | :-------------------------- | :--------- |
| Gerenciar usuários e perfis                          | Sim   | Não         | Não                         | Não        |
| Configurar empresa, integração bancária e parâmetros | Sim   | Não         | Não                         | Não        |
| Cadastrar funcionários, obras, jornadas e feriados   | Sim   | Sim         | Não                         | Não        |
| Lançar ponto                                         | Sim   | Sim (todos) | Sim (sua equipe)            | Não        |
| Ajustar ponto já lançado                             | Sim   | Sim         | Só antes do envio para o RH | Não        |
| Fechar e reabrir período                             | Sim   | Sim         | Não                         | Não        |
| Gerar espelho PDF e exportar para o contador         | Sim   | Sim         | Sim (sua equipe)            | Não        |
| Importar valores líquidos                            | Sim   | Sim         | Não                         | Sim        |
| Montar lote de pagamento                             | Sim   | Sim         | Não                         | Sim        |
| Aprovar e enviar lote                                | Sim   | Não         | Não                         | Sim        |
| Ver dados bancários completos                        | Sim   | Sim         | Não                         | Sim        |
| Ver relatórios de pagamento                          | Sim   | Sim         | Não                         | Sim        |

Quem monta um lote não pode aprovar o mesmo lote (RN-09).

## **4\. Requisitos funcionais**

39 requisitos em 7 módulos. Prioridade Alta entra no MVP; Média entra se houver folga nas sprints.

### **M1 — Acesso e usuários**

| ID     | Requisito                                                                                        | Prioridade |
| :----- | :----------------------------------------------------------------------------------------------- | :--------- |
| RF-001 | Login com e-mail e senha, sessão por JWT com refresh token                                       | Alta       |
| RF-002 | Cadastro de usuários e atribuição de perfil (Admin, RH, Encarregado, Financeiro)                 | Alta       |
| RF-003 | Vincular encarregado a uma ou mais obras/setores                                                 | Alta       |
| RF-004 | Redefinição de senha pelo administrador e troca de senha pelo próprio usuário                    | Alta       |
| RF-005 | Log de auditoria de ações sensíveis (ajuste de ponto, fechamento, aprovação, envio de pagamento) | Alta       |

### **M2 — Cadastros**

| ID     | Requisito                                                                               | Prioridade |
| :----- | :-------------------------------------------------------------------------------------- | :--------- |
| RF-006 | Cadastro de funcionários: nome, CPF, matrícula, cargo, admissão, desligamento, situação | Alta       |
| RF-007 | Dados de pagamento do funcionário: tipo e chave Pix, ou banco/agência/conta             | Alta       |
| RF-008 | Cadastro de obras/setores                                                               | Alta       |
| RF-009 | Cadastro de jornadas: horários, intervalo, carga semanal, tolerância                    | Alta       |
| RF-010 | Vínculo do funcionário a obra e jornada com data de vigência                            | Alta       |
| RF-011 | Calendário de feriados nacionais, estaduais e municipais                                | Alta       |
| RF-012 | Importação de funcionários por planilha                                                 | Média      |

### **M3 — Lançamento de ponto**

| ID     | Requisito                                                                                           | Prioridade |
| :----- | :-------------------------------------------------------------------------------------------------- | :--------- |
| RF-013 | Lançamento diário por equipe: grade com funcionários da obra e campos de entrada, intervalo e saída | Alta       |
| RF-014 | Lançamento por funcionário em visão semanal ou mensal                                               | Alta       |
| RF-015 | Ocorrências do dia: falta, falta justificada, atestado, folga, férias, afastamento                  | Alta       |
| RF-016 | Validação das marcações: ordem cronológica, sobreposição, intervalo mínimo                          | Alta       |
| RF-017 | Ajuste de marcação com justificativa obrigatória e histórico de alterações                          | Alta       |
| RF-018 | Encarregado envia o período da equipe para conferência do RH                                        | Alta       |
| RF-019 | Importação de marcações por CSV (relógio de ponto, se existir)                                      | Média      |

### **M4 — Apuração e fechamento**

| ID     | Requisito                                                                                 | Prioridade |
| :----- | :---------------------------------------------------------------------------------------- | :--------- |
| RF-020 | Cálculo diário: horas trabalhadas, extras 50% e 100%, adicional noturno, atrasos e faltas | Alta       |
| RF-021 | Banco de horas: saldo, compensação e opção de pagar ou compensar                          | Média      |
| RF-022 | Painel de pendências do período (dias sem lançamento, inconsistências)                    | Alta       |
| RF-023 | Fechamento do período, bloqueando edições                                                 | Alta       |
| RF-024 | Reabertura do período com motivo registrado                                               | Alta       |
| RF-025 | Espelho de ponto em PDF por funcionário e em lote (zip)                                   | Alta       |
| RF-026 | Exportação para o contador (XLSX/CSV com totais por funcionário)                          | Alta       |

### **M5 — Valores a pagar**

| ID     | Requisito                                                                                                          | Prioridade |
| :----- | :----------------------------------------------------------------------------------------------------------------- | :--------- |
| RF-027 | Importação dos líquidos do contador (CSV/XLSX) com casamento por CPF ou matrícula                                  | Alta       |
| RF-028 | Lançamento de pagamentos avulsos: adiantamento, diária, ajuda de custo                                             | Alta       |
| RF-029 | Conferência antes do lote: funcionários sem chave Pix, valores zerados, variação grande em relação ao mês anterior | Média      |

### **M6 — Pagamentos via Pix**

| ID     | Requisito                                                                                   | Prioridade |
| :----- | :------------------------------------------------------------------------------------------ | :--------- |
| RF-030 | Montar lote de pagamento a partir dos valores importados e avulsos                          | Alta       |
| RF-031 | Aprovação do lote por usuário diferente de quem montou, com resumo de quantidade e total    | Alta       |
| RF-032 | Envio Pix pela API do banco, um pagamento por item, com chave de idempotência               | Alta       |
| RF-033 | Atualização de status por webhook ou consulta periódica (pendente, pago, falhou, devolvido) | Alta       |
| RF-034 | Reenvio de itens com falha após correção dos dados                                          | Alta       |
| RF-035 | Comprovante por pagamento (com identificador E2E) para download                             | Alta       |
| RF-036 | Histórico e relatório de pagamentos por período e por funcionário                           | Alta       |
| RF-037 | Validação da chave Pix antes do envio (nome do titular), se a API do banco oferecer         | Média      |

### **M7 — Painel e configurações**

| ID     | Requisito                                                                                                     | Prioridade |
| :----- | :------------------------------------------------------------------------------------------------------------ | :--------- |
| RF-038 | Painel inicial: pendências de ponto, status do período, lotes aguardando aprovação, total previsto            | Média      |
| RF-039 | Configurações: parâmetros de apuração (tolerância, percentuais de extra) e credenciais da integração bancária | Alta       |

## **5\. Requisitos não funcionais**

| ID     | Requisito                                                                                                     |
| :----- | :------------------------------------------------------------------------------------------------------------ |
| RNF-01 | Interface web responsiva; a tela de lançamento de ponto deve funcionar bem no celular do encarregado na obra  |
| RNF-02 | Lançamento de uma equipe de 30 pessoas em menos de 5 minutos (navegação por teclado, replicar horário padrão) |
| RNF-03 | Senhas com hash (argon2 ou bcrypt), HTTPS obrigatório, JWT de curta duração                                   |
| RNF-04 | Credenciais e certificado do banco criptografados em repouso, nunca expostos ao front-end                     |
| RNF-05 | Dados bancários e CPF mascarados para perfis sem permissão (LGPD)                                             |
| RNF-06 | Toda chamada à API do banco registrada (requisição, resposta, horário), sem gravar segredos                   |
| RNF-07 | Envio de pagamento idempotente: repetir a operação nunca gera Pix duplicado                                   |
| RNF-08 | Backup diário do banco de dados com retenção mínima de 30 dias                                                |
| RNF-09 | API documentada em OpenAPI (Swagger)                                                                          |
| RNF-10 | Cobertura de testes nas regras de apuração e pagamento de pelo menos 80%                                      |
| RNF-11 | Implantação por Docker Compose em um único servidor                                                           |
| RNF-12 | Fuso horário fixo America/Bahia nas regras de ponto                                                           |

## **6\. Regras de negócio**

| ID    | Regra                                                                                            |
| :---- | :----------------------------------------------------------------------------------------------- |
| RN-01 | O período padrão é mensal, do dia 1 ao último dia do mês; o dia de corte pode ser configurado    |
| RN-02 | Tolerância diária de até 10 minutos (CLT art. 58, §1º); dentro dela não há atraso nem extra      |
| RN-03 | Hora extra em dia útil vale 50%; em domingo ou feriado, 100% (percentuais configuráveis)         |
| RN-04 | Trabalho entre 22h e 5h gera adicional noturno                                                   |
| RN-05 | Encarregado só lança e ajusta ponto dos funcionários vinculados às suas obras                    |
| RN-06 | Depois de enviado ao RH, o encarregado não altera mais o período                                 |
| RN-07 | Período fechado não aceita alteração; reabrir exige motivo e fica no log                         |
| RN-08 | Funcionário sem chave Pix ou conta válida não entra no lote                                      |
| RN-09 | Quem monta o lote não pode aprová-lo                                                             |
| RN-10 | Lote aprovado não pode ser editado; correções viram novo lote                                    |
| RN-11 | Pagamento só é marcado como pago após confirmação do banco                                       |
| RN-12 | Funcionário desligado continua visível nos períodos anteriores, mas não recebe novos lançamentos |

O controle de ponto só é obrigatório acima de 20 empregados (CLT art. 74, §2º). Se o sistema for usado como registro oficial, a Portaria MTP 671/2021 traz exigências extras (ver seção 10).

## **7\. Stack e arquitetura**

Front-end em Angular; back-end com a mesma base do SGE (Node.js, NestJS, Prisma, PostgreSQL), sem as peças que só faziam sentido no ERP (RLS multiempresa, Redis, BullMQ).

| Camada              | Tecnologia                                                                                                                            |
| :------------------ | :------------------------------------------------------------------------------------------------------------------------------------ |
| Front-end           | Angular \+ TypeScript (standalone components, signals), Angular Router, Reactive Forms, HttpClient com interceptors, Angular Material |
| Back-end            | Node.js \+ NestJS (TypeScript), módulos por domínio                                                                                   |
| ORM e banco         | Prisma \+ PostgreSQL 16                                                                                                               |
| Jobs agendados      | @nestjs/schedule (consulta de status Pix, lembretes)                                                                                  |
| PDF e planilhas     | Geração de PDF no servidor (pdfmake ou Puppeteer), ExcelJS para XLSX                                                                  |
| Documentação da API | OpenAPI / Swagger                                                                                                                     |
| Testes              | Jest (back-end e front-end), Playwright para testes ponta a ponta                                                                     |
| Infra               | Docker Compose: api, web (Nginx) e postgres                                                                                           |

**Organização:** monorepo com apps/api, apps/web e packages/shared (interfaces e enums compartilhados entre Angular e NestJS).

**Fluxo do período:**

1. Encarregado lança o ponto da equipe ao longo do mês.
2. Encarregado envia o período para o RH.
3. RH confere, ajusta, fecha o período e exporta as horas para o contador.
4. Contador devolve os líquidos; RH ou financeiro importa a planilha.
5. Financeiro (ou RH) monta o lote; outro usuário do financeiro aprova.
6. Sistema envia os Pix, acompanha o status e guarda os comprovantes.

## **8\. Modelo de dados inicial**

15 tabelas, todas com PK uuid e valores em numeric(12,2).

| Entidade             | Campos principais                                                                                     | Relações                            |
| :------------------- | :---------------------------------------------------------------------------------------------------- | :---------------------------------- |
| usuario              | nome, email, senha\_hash, perfil, ativo                                                               | N:N com obra (encarregado)          |
| obra                 | nome, endereço, ativa                                                                                 | 1:N vinculo\_funcionario            |
| jornada              | nome, entrada, saida, intervalo\_min, carga\_semanal, tolerancia\_min, dias\_semana                   | 1:N vinculo\_funcionario            |
| funcionario          | nome, cpf, matricula, cargo, admissao, desligamento, situacao                                         | 1:N vinculo, marcacao, valor\_pagar |
| dados\_pagamento     | tipo\_chave, chave\_pix, banco, agencia, conta, validado\_em                                          | 1:1 funcionario                     |
| vinculo\_funcionario | funcionario, obra, jornada, inicio\_vigencia, fim\_vigencia                                           | N:1 funcionario, obra, jornada      |
| feriado              | data, descricao, abrangencia                                                                          | —                                   |
| periodo              | competencia, data\_inicio, data\_fim, status (aberto, em\_conferencia, fechado)                       | 1:N dia\_ponto                      |
| dia\_ponto           | funcionario, data, ocorrencia, status\_envio, totais calculados                                       | 1:N marcacao                        |
| marcacao             | dia\_ponto, horario, tipo (entrada, saida\_intervalo, retorno, saida), origem                         | N:1 dia\_ponto                      |
| ajuste\_ponto        | marcacao, valor\_anterior, valor\_novo, justificativa, usuario                                        | N:1 marcacao                        |
| valor\_pagar         | funcionario, periodo, tipo (salario, adiantamento, diaria, outros), valor, origem (importado, avulso) | N:1 lote\_item                      |
| lote\_pagamento      | descricao, status, criado\_por, aprovado\_por, total                                                  | 1:N lote\_item                      |
| lote\_item           | lote, funcionario, valor, chave\_pix, status, id\_banco, e2e\_id, idempotency\_key, erro              | N:1 lote\_pagamento                 |
| log\_auditoria       | usuario, acao, entidade, entidade\_id, antes, depois, data                                            | —                                   |

## **9\. Integração bancária Pix**

O sistema conversa com o banco por uma interface única (PagamentoProvider), com uma implementação por banco. Assim dá para trocar de banco sem mexer nas regras de lote.

**Candidatos:** Banco Inter PJ, Efí (antiga Gerencianet), Asaas, ou a API Pix do banco onde a empresa já tem conta. O critério principal é usar o banco onde está o dinheiro da folha.

**Operações que o provider precisa oferecer:**

- Autenticar (OAuth2 client credentials, quase sempre com certificado mTLS)
- Consultar chave Pix e titular, quando o banco permitir
- Enviar Pix com valor, chave e chave de idempotência
- Consultar status de um pagamento
- Receber webhook de confirmação ou devolução
- Obter comprovante

**Cuidados:** desenvolver e testar todo o fluxo no sandbox do banco antes de usar credenciais de produção; limitar o valor máximo por pagamento e por lote nas configurações; guardar certificado e segredos fora do repositório.

## **10\. Pontos em aberto e premissas**

- ☐ Qual banco será usado na integração (definir até o fim da Sprint 05\)
- ☐ Quantos funcionários a empresa tem: acima de 20, avaliar a Portaria MTP 671/2021 (comprovante, arquivos AFD/AEJ, registro do programa no INPI)
- ☐ Formato da planilha que o contador devolve com os líquidos
- ☐ Período de apuração: mês cheio ou com dia de corte
- ☐ Haverá banco de horas ou só pagamento de extras
- ☐ Onde hospedar (servidor da empresa, VPS ou nuvem gratuita)

**Premissas:** uma única empresa; o funcionário não acessa o sistema; a folha (encargos e impostos) continua com o contador; pagamentos apenas por Pix no MVP.
