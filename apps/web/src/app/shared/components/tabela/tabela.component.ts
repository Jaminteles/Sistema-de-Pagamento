import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { EstadoConteudoComponent } from '../estado-conteudo/estado-conteudo.component';
import type { ColunaTabela } from './coluna-tabela';

/**
 * Tabela reutilizavel com os estados de carregando, vazio e erro.
 * Nao faz calculo: apenas exibe o texto produzido por cada coluna.
 */
@Component({
  selector: 'app-tabela',
  imports: [MatTableModule, EstadoConteudoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tabela.component.scss',
  template: `
    <app-estado-conteudo
      [carregando]="carregando()"
      [erro]="erro()"
      [vazio]="dados().length === 0"
      [mensagemVazio]="mensagemVazio()"
      (recarregar)="recarregar.emit()"
    >
      <div class="tabela-rolagem">
        <table mat-table [dataSource]="dados()" [class.tabela--clicavel]="selecionavel()">
          @for (coluna of colunas(); track coluna.chave) {
            <ng-container [matColumnDef]="coluna.chave">
              <th
                mat-header-cell
                *matHeaderCellDef
                [class.celula--fim]="coluna.alinhamento === 'fim'"
                [class.celula--oculta-celular]="coluna.ocultarNoCelular"
              >
                {{ coluna.titulo }}
              </th>
              <td
                mat-cell
                *matCellDef="let linha"
                [class.celula--fim]="coluna.alinhamento === 'fim'"
                [class.celula--oculta-celular]="coluna.ocultarNoCelular"
              >
                {{ coluna.valor(linha) }}
              </td>
            </ng-container>
          }

          <tr mat-header-row *matHeaderRowDef="chavesColunas()"></tr>
          <tr
            mat-row
            *matRowDef="let linha; columns: chavesColunas()"
            [attr.tabindex]="selecionavel() ? 0 : null"
            (click)="aoSelecionar(linha)"
            (keydown.enter)="aoSelecionar(linha)"
          ></tr>
        </table>
      </div>
    </app-estado-conteudo>
  `,
})
export class TabelaComponent<T> {
  readonly colunas = input.required<readonly ColunaTabela<T>[]>();
  readonly dados = input<readonly T[]>([]);
  readonly carregando = input(false);
  readonly erro = input<string | null>(null);
  readonly mensagemVazio = input('Nenhum registro encontrado.');
  readonly selecionavel = input(false);

  readonly recarregar = output<void>();
  readonly selecionar = output<T>();

  readonly chavesColunas = computed(() => this.colunas().map((coluna) => coluna.chave));

  aoSelecionar(linha: T): void {
    if (this.selecionavel()) {
      this.selecionar.emit(linha);
    }
  }
}
