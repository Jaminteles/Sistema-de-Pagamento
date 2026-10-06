import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@sistema/shared';

/** Documentacao OpenAPI (RNF-09). Desligavel por ambiente via SWAGGER_ENABLED. */
export function configurarSwagger(app: INestApplication): string {
  const caminho = `${API_PREFIX}/docs`;

  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Sistema de Ponto e Pagamento')
      .setDescription(
        'API de ponto, apuracao e pagamento via Pix. Perfis: ADMIN, RH, ENCARREGADO e FINANCEIRO. ' +
          'O funcionario nao e usuario do sistema.',
      )
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build(),
  );

  SwaggerModule.setup(caminho, app, documento, {
    swaggerOptions: { persistAuthorization: true },
  });

  return caminho;
}
