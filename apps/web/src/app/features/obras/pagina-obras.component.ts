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
import { PAGINACAO_TAMANHO_PADRAO, PerfilUsuario, type ObraResponse } from '@sistema/shared';
import { AuthService } from '../../core/auth/auth.service';
import { mensagemDoErro } from '../../core/http/erro-api';
import type { ColunaTabela } from '../../shared/components/tabela/coluna-tabela';
import { TabelaComponent } from '../../shared/components/tabela/tabela.component';
import { ObrasService } from './obras.service';

/**
 * Listagem de obras/setores (T-020 / RF-008).
 *
 * O ENCARREGADO tambem abre esta tela, mas a API devolve somente as obras
 * vinculadas a ele (RN-05) e os botoes de cadastro ficam escondidos. Esconder
 * botao e experiencia de uso: quem recusa a escrita e o guard do back-end.
 */
@Component({
  selector: 'app-pagina-obras',
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
  styleUrl: './pagina-obras.component.scss',
  templateUrl: './pagina-obras.component.html',
})
export class PaginaObrasComponent {
  private readonly servico = inject(ObrasService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly obras = signal<readonly ObraResponse[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly tamanho = signal(PAGINACAO_TAMANHO_PADRAO);

  /** Cadastro e de ADMIN e RH (matriz da secao 3 do Levantamento de Requisitos). */
  readonly podeCadastrar = computed(() =>
    this.auth.temAlgumPerfil([PerfilUsuario.ADMIN, PerfilUsuario.RH]),
  );

  readonly filtros = this.formBuilder.group({
    busca: this.formBuilder.control<string | null>(null),
    ativa: this.formBuilder.control<boolean | null>(null),
  });

  readonly colunas: readonly ColunaTabela<ObraResponse>[] = [
    { chave: 'nome', titulo: 'Nome', valor: (linha) => linha.nome },
    {
      chave: 'endereco',
      titulo: 'Endereco',
      valor: (linha) => linha.endereco ?? '-',
      ocultarNoCelular: true,
    },
    {
      chave: 'situacao',
      titulo: 'Situacao',
      valor: (linha) => (linha.ativa ? 'Ativa' : 'Inativa'),
    },
  ];

  constructor() {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    const { busca, ativa } = this.filtros.getRawValue();

    this.servico
      .listar({
        ...(busca ? { busca } : {}),
        ...(ativa === null ? {} : { ativa }),
        pagina: this.pagina(),
        tamanho: this.tamanho(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.obras.set(resposta.itens);
          this.total.set(resposta.total);
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel carregar as obras.',
          );
          this.carregando.set(false);
        },
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

  nova(): void {
    void this.router.navigate(['/obras/nova']);
  }

  abrir(obra: ObraResponse): void {
    void this.router.navigate(['/obras', obra.id]);
  }
}
