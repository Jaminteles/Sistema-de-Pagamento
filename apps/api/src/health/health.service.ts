import { Injectable, Logger } from '@nestjs/common';
import type { HealthResponse } from '@sistema/shared';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async verificar(): Promise<HealthResponse> {
    const banco = await this.verificarBanco();

    return {
      status: banco === 'up' ? 'ok' : 'degraded',
      database: banco,
      timestamp: new Date().toISOString(),
    };
  }

  private async verificarBanco(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (erro) {
      this.logger.error('Banco indisponivel.', erro instanceof Error ? erro.stack : String(erro));
      return 'down';
    }
  }
}
