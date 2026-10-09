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
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import {
  type FuncionarioResponse,
  type ObraResponse,
  PAGINACAO_TAMANHO_PADRAO,
  PerfilUsuario,
  SITUACAO_FUNCIONARIO_LABEL,
  SITUACOES_FUNCIONARIO,
  type SituacaoFuncionario,
} from '@sistema/shared';
import { AuthService } from '../../core/auth/auth.service';
import { mensagemDoErro } from '../../core/http/erro-api';
import type { ColunaTabela } from '../../shared/components/tabela/coluna-tabela';
import { TabelaComponent } from '../../shared/components/tabela/tabela.component';
import { ObrasService } from '../obras/obras.service';
import { FuncionariosService } from './funcionarios.service';

/** Obras suficientes para o filtro; a empresa nao tem centenas de obras. */
const LIMITE_OBRAS = 100;

/**
 * Listagem de funcionarios com busca e filtros (T-028 / RF-006).
 *
 * O ENCARREGADO tambem abre esta tela, mas a API devolve somente quem tem
 * vinculo com as obras dele (RN-05) e com o CPF mascarado (RNF-05). Esconder
 * botao aqui e experiencia de uso: quem recusa a escrita e o guard do
 * back-end.
 */
@Component({
  selector: 'app-pagina-funcionarios',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    ReactiveFormsModule,
    TabelaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-funcionarios.component.scss',
  templateUrl: './pagina-funcionarios.component.html',
})
export class PaginaFuncionariosComponent {
  private readonly servico = inject(FuncionariosService);
  private readonly obrasServico = inject(ObrasService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly funcionarios = signal<readonly FuncionarioResponse[]>([]);
  readonly obras = signal<readonly ObraResponse[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly tamanho = signal(PAGINACAO_TAMANHO_PADRAO);

  readonly situacoes = SITUACOES_FUNCIONARIO;
  readonly rotuloSituacao = SITUACAO_FUNCIONARIO_LABEL;

  /** Cadastro e de ADMIN e RH (matriz da secao 3 do Levantamento de Requisitos). */
  readonly podeCadastrar = computed(() =>
    this.auth.temAlgumPerfil([PerfilUsuario.ADMIN, PerfilUsuario.RH]),
  );

  readonly filtros = this.formBuilder.group({
    busca: this.formBuilder.control<string | null>(null),
    situacao: this.formBuilder.control<SituacaoFuncionario | null>(null),
    obraId: this.formBuilder.control<string | null>(null),
  });

  readonly colunas: readonly ColunaTabela<FuncionarioResponse>[] = [
    { chave: 'nome', titulo: 'Nome', valor: (linha) => linha.nome },
    { chave: 'matricula', titulo: 'Matricula', valor: (linha) => linha.matricula },
    { chave: 'cpf', titulo: 'CPF', valor: (linha) => linha.cpf, ocultarNoCelular: true },
    {
      chave: 'obra',
      titulo: 'Obra atual',
      valor: (linha) => linha.vinculoAtual?.obraNome ?? 'Sem vinculo',
      ocultarNoCelular: true,
    },
    {
      chave: 'situacao',
      titulo: 'Situacao',
      valor: (linha) => SITUACAO_FUNCIONARIO_LABEL[linha.situacao],
    },
    {
      chave: 'pagamento',
      titulo: 'Pagamento',
      // RN-08: sem chave Pix ou conta, o funcionario nao entra em lote.
      valor: (linha) => (linha.temDadosPagamento ? 'Cadastrado' : 'Pendente'),
      ocultarNoCelular: true,
    },
  ];

  constructor() {
    this.carregar();
    this.carregarObras();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    const { busca, situacao, obraId } = this.filtros.getRawValue();

    this.servico
      .listar({
        ...(busca ? { busca } : {}),
        ...(situacao ? { situacao } : {}),
        ...(obraId ? { obraId } : {}),
        pagina: this.pagina(),
        tamanho: this.tamanho(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.funcionarios.set(resposta.itens);
          this.total.set(resposta.total);
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel carregar os funcionarios.',
          );
          this.carregando.set(false);
        },
      });
  }

  /** O encarregado recebe daqui somente as obras dele (RN-05), aplicado pela API. */
  private carregarObras(): void {
    this.obrasServico
      .listar({ ativa: true, pagina: 1, tamanho: LIMITE_OBRAS })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => this.obras.set(resposta.itens),
        error: () => this.obras.set([]),
      });
  }

  aplicarFiltros(): void {
    this.pagina.set(1);
    this.carregar();
  }

  limparFiltros(): void {
    this.filtros.reset();
    this.aplicarFiltros();
  }

  mudarPagina(evento: PageEvent): void {
    this.pagina.set(evento.pageIndex + 1);
    this.tamanho.set(evento.pageSize);
    this.carregar();
  }

  novo(): void {
    void this.router.navigate(['/funcionarios/novo']);
  }

  importar(): void {
    void this.router.navigate(['/funcionarios/importacao']);
  }

  abrir(funcionario: FuncionarioResponse): void {
    void this.router.navigate(['/funcionarios', funcionario.id]);
  }
}
