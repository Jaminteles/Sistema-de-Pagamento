import { Module } from '@nestjs/common';
import { CriptografiaService } from '../common/crypto/criptografia.service';
import { JornadasModule } from '../jornadas/jornadas.module';
import { ObrasModule } from '../obras/obras.module';
import { DadosPagamentoService } from './dados-pagamento.service';
import { EscopoFuncionarioService } from './escopo-funcionario.service';
import { FuncionariosController } from './funcionarios.controller';
import { FuncionariosRepository } from './funcionarios.repository';
import { FuncionariosService } from './funcionarios.service';
import { ImportacaoFuncionariosService } from './importacao-funcionarios.service';
import { VinculosService } from './vinculos.service';

/**
 * Funcionarios e o que depende deles no cadastro: dados de pagamento (RF-007),
 * vinculo com obra e jornada (RF-010) e importacao por planilha (RF-012).
 *
 * Importa ObrasModule pelo EscopoObraService (RN-05) e pelo ObrasRepository, e
 * JornadasModule pelo JornadasRepository: validar obra e jornada do vinculo
 * reusa o repositorio de cada modulo em vez de reconsultar por fora.
 *
 * Exporta o EscopoFuncionarioService e o FuncionariosRepository: o modulo de
 * ponto da sprint 5 aplica o escopo do encarregado por eles.
 */
@Module({
  imports: [ObrasModule, JornadasModule],
  controllers: [FuncionariosController],
  providers: [
    FuncionariosService,
    FuncionariosRepository,
    EscopoFuncionarioService,
    DadosPagamentoService,
    VinculosService,
    ImportacaoFuncionariosService,
    CriptografiaService,
  ],
  exports: [EscopoFuncionarioService, FuncionariosRepository],
})
export class FuncionariosModule {}
