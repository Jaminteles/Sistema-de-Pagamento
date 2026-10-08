import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
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
  DIA_SEMANA_ABREVIADO,
  type JornadaResponse,
  minutosParaDuracao,
  minutosParaHora,
  PAGINACAO_TAMANHO_PADRAO,
} from '@sistema/shared';
import { mensagemDoErro } from '../../core/http/erro-api';
import type { ColunaTabela } from '../../shared/components/tabela/coluna-tabela';
import { TabelaComponent } from '../../shared/components/tabela/tabela.component';
import { JornadasService } from './jornadas.service';

/**
 * Listagem de jornadas (T-021 / RF-009).
 *
 * As colunas apenas formatam o que a API devolve em minutos inteiros; nenhum
 * calculo de apuracao acontece aqui.
 */
@Component({
  selector: 'app-pagina-jornadas',
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
  styleUrl: './pagina-jornadas.component.scss',
  templateUrl: './pagina-jornadas.component.html',
})
export class PaginaJornadasComponent {
  private readonly servico = inject(JornadasService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly jornadas = signal<readonly JornadaResponse[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly tamanho = signal(PAGINACAO_TAMANHO_PADRAO);

  readonly filtros = this.formBuilder.group({
    busca: this.formBuilder.control<string | null>(null),
    ativa: this.formBuilder.control<boolean | null>(null),
  });

  readonly colunas: readonly ColunaTabela<JornadaResponse>[] = [
    { chave: 'nome', titulo: 'Nome', valor: (linha) => linha.nome },
    {
      chave: 'horario',
      titulo: 'Horario',
      valor: (linha) =>
        `${minutosParaHora(linha.entradaMinutos)} - ${minutosParaHora(linha.saidaMinutos)}`,
    },
    {
      chave: 'intervalo',
      titulo: 'Intervalo',
      valor: (linha) => minutosParaDuracao(linha.intervaloMinutos),
      ocultarNoCelular: true,
    },
    {
      chave: 'carga',
      titulo: 'Carga semanal',
      valor: (linha) => minutosParaDuracao(linha.cargaSemanalMinutos),
      alinhamento: 'fim',
    },
    {
      chave: 'dias',
      titulo: 'Dias',
      valor: (linha) => linha.diasSemana.map((dia) => DIA_SEMANA_ABREVIADO[dia]).join(', '),
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
          this.jornadas.set(resposta.itens);
          this.total.set(resposta.total);
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel carregar as jornadas.',
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
    void this.router.navigate(['/jornadas/nova']);
  }

  abrir(jornada: JornadaResponse): void {
    void this.router.navigate(['/jornadas', jornada.id]);
  }
}
