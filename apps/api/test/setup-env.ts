/**
 * Ambiente dos testes automatizados.
 *
 * Roda antes de qualquer import do codigo da aplicacao, porque o ConfigModule
 * valida o ambiente no momento em que o modulo e carregado.
 *
 * Nenhuma credencial real: a conexao nunca e aberta nos testes (o PrismaService
 * e substituido por dublê) e nenhuma chamada sai para a API do banco.
 */
process.env['NODE_ENV'] = 'test';
process.env['API_PORT'] = '3000';
process.env['DATABASE_URL'] = 'postgresql://teste:teste@localhost:5432/teste?schema=public';
process.env['CORS_ORIGIN'] = 'http://localhost:4200';
process.env['SWAGGER_ENABLED'] = 'false';

// Segredos de teste, sem valor real e sem relacao com qualquer ambiente.
process.env['JWT_ACCESS_SECRET'] = 'segredo-de-teste-para-access-token-0001';
process.env['JWT_REFRESH_SECRET'] = 'segredo-de-teste-para-refresh-token-002';
process.env['JWT_ACCESS_TTL_SEGUNDOS'] = '900';
process.env['JWT_REFRESH_TTL_DIAS'] = '7';

// Chave de criptografia dos dados de pagamento (RNF-04): 32 bytes fixos, sem
// relacao com qualquer ambiente real.
process.env['DADOS_PAGAMENTO_CHAVE'] = Buffer.alloc(32, 7).toString('base64');
