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
