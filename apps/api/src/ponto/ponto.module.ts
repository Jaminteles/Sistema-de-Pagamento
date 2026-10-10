import { Module } from '@nestjs/common';
import { FuncionariosModule } from '../funcionarios/funcionarios.module';
import { ObrasModule } from '../obras/obras.module';
import { LancamentoService } from './lancamento.service';
import { PeriodosController } from './periodos.controller';
import { PeriodosService } from './periodos.service';
import { PontoController } from './ponto.controller';
import { PontoRepository } from './ponto.repository';
import { PontoService } from './ponto.service';

/**
 * Lancamento de ponto (M3, sprint 5): periodo e dias (RF-013), grade por
 * equipe (RF-013), visao por funcionario (RF-014), ocorrencias (RF-015) e
 * validacao das marcacoes (RF-016).
 *
 * Importa ObrasModule pelo EscopoObraService e FuncionariosModule pelo
 * EscopoFuncionarioService: o recorte do encarregado (RN-05) e sempre o mesmo
 * dos cadastros, decidido a partir do usuario autenticado.
 *
 * Exporta o PontoRepository porque a sprint 6 (ajuste, envio ao RH e motor de
 * apuracao) trabalha sobre os mesmos dias e marcacoes.
 */
@Module({
  imports: [ObrasModule, FuncionariosModule],
  controllers: [PeriodosController, PontoController],
  providers: [PontoRepository, PeriodosService, LancamentoService, PontoService],
  exports: [PontoRepository],
})
export class PontoModule {}
