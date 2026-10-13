import { Module } from '@nestjs/common';
import { ApuracaoService } from '../apuracao/apuracao.service';
import { FuncionariosModule } from '../funcionarios/funcionarios.module';
import { ObrasModule } from '../obras/obras.module';
import { AjusteService } from './ajuste.service';
import { EnvioRhService } from './envio-rh.service';
import { ImportacaoMarcacoesService } from './importacao-marcacoes.service';
import { LancamentoService } from './lancamento.service';
import { PeriodosController } from './periodos.controller';
import { PeriodosService } from './periodos.service';
import { PontoController } from './ponto.controller';
import { PontoRepository } from './ponto.repository';
import { PontoService } from './ponto.service';

/**
 * Lancamento de ponto e apuracao (M3 e M4).
 *
 * Sprint 5: periodo e dias (RF-013), grade por equipe (RF-013), visao por
 * funcionario (RF-014), ocorrencias (RF-015) e validacao das marcacoes
 * (RF-016).
 *
 * Sprint 6: ajuste com justificativa e historico (RF-017), envio do periodo ao
 * RH (RF-018), importacao de marcacoes por CSV (RF-019) e motor de apuracao
 * diaria (RF-020).
 *
 * Importa ObrasModule pelo EscopoObraService e FuncionariosModule pelo
 * EscopoFuncionarioService e pelo FuncionariosRepository: o recorte do
 * encarregado (RN-05) e sempre o mesmo dos cadastros, decidido a partir do
 * usuario autenticado.
 *
 * O ApuracaoService entra aqui como provider, e nao em um modulo proprio,
 * porque grava nos mesmos dias de ponto (o motor em si e funcao pura, em
 * apuracao/motor-apuracao.ts). Registra-lo em outro modulo criaria um ciclo com
 * o PontoRepository sem separar nada de verdade.
 *
 * Exporta o PontoRepository porque as sprints seguintes (banco de horas,
 * fechamento, espelho de ponto) trabalham sobre os mesmos dias e marcacoes.
 */
@Module({
  imports: [ObrasModule, FuncionariosModule],
  controllers: [PeriodosController, PontoController],
  providers: [
    PontoRepository,
    ApuracaoService,
    PeriodosService,
    LancamentoService,
    PontoService,
    AjusteService,
    EnvioRhService,
    ImportacaoMarcacoesService,
  ],
  exports: [PontoRepository, ApuracaoService],
})
export class PontoModule {}
