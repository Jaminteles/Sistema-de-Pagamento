import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import {
  IMPORTACAO_FUNCIONARIOS_COLUNAS,
  IMPORTACAO_FUNCIONARIOS_EXTENSOES,
  IMPORTACAO_FUNCIONARIOS_MAXIMO_LINHAS,
  IMPORTACAO_FUNCIONARIOS_TAMANHO_MAXIMO_BYTES,
  type ImportarFuncionariosResponse,
} from '@sistema/shared';
import { mensagemDoErro } from '../../core/http/erro-api';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import type { ColunaTabela } from '../../shared/components/tabela/coluna-tabela';
import { TabelaComponent } from '../../shared/components/tabela/tabela.component';
import { FuncionariosService } from './funcionarios.service';

/** Linha da previa como a tabela exibe. */
type LinhaPrevia = ImportarFuncionariosResponse['itens'][number];
type LinhaErro = ImportarFuncionariosResponse['erros'][number];

/**
 * Importacao de funcionarios por planilha, com pre-visualizacao
 * (T-030 / RF-012).
 *
 * A previa chama o mesmo endpoint de validacao da importacao, com a diferenca
 * de nao gravar nada: o que a tela mostra e exatamente o que a API faria. A
 * confirmacao so aparece depois de uma previa sem erro bloqueante.
 */
@Component({
  selector: 'app-pagina-importar-funcionarios',
  imports: [MatButtonModule, MatCardModule, MatIconModule, TabelaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-importar-funcionarios.component.scss',
  templateUrl: './pagina-importar-funcionarios.component.html',
})
export class PaginaImportarFuncionariosComponent {
  private readonly servico = inject(FuncionariosService);
  private readonly router = inject(Router);
  private readonly notificacao = inject(NotificacaoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly extensoes = IMPORTACAO_FUNCIONARIOS_EXTENSOES.join(', ');
  readonly colunasEsperadas = IMPORTACAO_FUNCIONARIOS_COLUNAS.join(', ');
  readonly maximoLinhas = IMPORTACAO_FUNCIONARIOS_MAXIMO_LINHAS;
  readonly tamanhoMaximoMb = Math.floor(IMPORTACAO_FUNCIONARIOS_TAMANHO_MAXIMO_BYTES / 1024 / 1024);

  readonly arquivo = signal<File | null>(null);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly relatorio = signal<ImportarFuncionariosResponse | null>(null);
  readonly importado = signal(false);

  /** Habilita a confirmacao apenas depois de uma previa com linhas a criar. */
  readonly podeConfirmar = computed(() => {
    const atual = this.relatorio();
    return atual !== null && atual.simulacao && atual.criados > 0 && !this.importado();
  });

  readonly colunas: readonly ColunaTabela<LinhaPrevia>[] = [
    { chave: 'linha', titulo: 'Linha', valor: (item) => String(item.linha) },
    { chave: 'nome', titulo: 'Nome', valor: (item) => item.nome },
    { chave: 'cpf', titulo: 'CPF', valor: (item) => item.cpf, ocultarNoCelular: true },
    { chave: 'matricula', titulo: 'Matricula', valor: (item) => item.matricula },
    { chave: 'cargo', titulo: 'Cargo', valor: (item) => item.cargo ?? '-', ocultarNoCelular: true },
    { chave: 'admissao', titulo: 'Admissao', valor: (item) => item.admissao },
    {
      chave: 'situacao',
      titulo: 'Situacao',
      valor: (item) => (item.jaCadastrado ? 'Ja cadastrado' : 'Sera criado'),
    },
  ];

  readonly colunasErro: readonly ColunaTabela<LinhaErro>[] = [
    { chave: 'linha', titulo: 'Linha', valor: (item) => String(item.linha) },
    { chave: 'campo', titulo: 'Campo', valor: (item) => item.campo ?? '-' },
    { chave: 'mensagem', titulo: 'Problema', valor: (item) => item.mensagem },
  ];

  selecionar(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    this.arquivo.set(entrada.files?.[0] ?? null);
    this.relatorio.set(null);
    this.importado.set(false);
    this.erro.set(null);
  }

  /** Valida sem gravar: e o que alimenta a pre-visualizacao. */
  previsualizar(): void {
    this.enviar(true);
  }

  confirmar(): void {
    this.enviar(false);
  }

  private enviar(simular: boolean): void {
    const arquivo = this.arquivo();
    if (arquivo === null || this.enviando()) {
      return;
    }

    this.enviando.set(true);
    this.erro.set(null);

    this.servico
      .importar(arquivo, simular)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.enviando.set(false);
          this.relatorio.set(resposta);

          if (simular) {
            return;
          }
          this.importado.set(true);
          this.notificacao.sucesso(
            `${String(resposta.criados)} funcionario(s) importado(s).`,
          );
        },
        error: (erro: unknown) => {
          this.enviando.set(false);
          this.relatorio.set(null);
          this.erro.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel processar a planilha.',
          );
        },
      });
  }

  voltar(): void {
    void this.router.navigate(['/funcionarios']);
  }
}
