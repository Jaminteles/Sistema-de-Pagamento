import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-pagina-nao-encontrado',
  imports: [MatButtonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="nao-encontrado">
      <h1>Pagina nao encontrada</h1>
      <p>O endereco acessado nao existe ou foi movido.</p>
      <a matButton="filled" routerLink="/inicio">Voltar para o inicio</a>
    </section>
  `,
  styles: `
    .nao-encontrado {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }

    h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 500;
    }
  `,
})
export class PaginaNaoEncontradoComponent {}
