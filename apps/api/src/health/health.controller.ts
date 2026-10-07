import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@sistema/shared';
import { Publico } from '../auth/decorators/publico.decorator';
import { HealthService } from './health.service';

/**
 * Rota publica usada pelo Docker Compose e pelo Nginx para checar a API.
 * Nao expoe versao, variavel de ambiente nem dado de infraestrutura.
 */
@ApiTags('Infra')
@Publico()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifica se a API e o banco estao respondendo' })
  @ApiOkResponse({
    description: 'Situacao da API e do banco',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ok', 'degraded'] },
        database: { type: 'string', enum: ['up', 'down'] },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  verificar(): Promise<HealthResponse> {
    return this.health.verificar();
  }
}
