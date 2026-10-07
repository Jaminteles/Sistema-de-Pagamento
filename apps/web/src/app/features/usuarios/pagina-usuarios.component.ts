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
  PAGINACAO_TAMANHO_PADRAO,
  PERFIL_USUARIO_LABEL,
  PERFIS_USUARIO,
  type PerfilUsuario,
  type UsuarioResponse,
} from '@sistema/shared';
import { mensagemDoErro } from '../../core/http/erro-api';
import type { ColunaTabela } from '../../shared/components/tabela/coluna-tabela';
import { TabelaComponent } from '../../shared/components/tabela/tabela.component';
import { UsuariosService } from './usuarios.service';

/**
 * Listagem de usuarios com busca, filtros e paginacao (T-014 / RF-002).
 *
 * Exclusiva do ADMIN: a rota tem guard de perfil e a API recusa qualquer outro
 * perfil com 403.
 */
@Component({
  selector: 'app-pagina-usuarios',
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
  styleUrl: './pagina-usuarios.component.scss',
  templateUrl: './pagina-usuarios.component.html',
})
export class PaginaUsuariosComponent {
  private readonly servico = inject(UsuariosService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly perfis = PERFIS_USUARIO;
  readonly rotuloPerfil = PERFIL_USUARIO_LABEL;

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly usuarios = signal<readonly UsuarioResponse[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(1);
  readonly tamanho = signal(PAGINACAO_TAMANHO_PADRAO);

  readonly filtros = this.formBuilder.group({
    busca: this.formBuilder.control<string | null>(null),
    perfil: this.formBuilder.control<PerfilUsuario | null>(null),
    ativo: this.formBuilder.control<boolean | null>(null),
  });

  readonly colunas: readonly ColunaTabela<UsuarioResponse>[] = [
    { chave: 'nome', titulo: 'Nome', valor: (linha) => linha.nome },
    { chave: 'email', titulo: 'E-mail', valor: (linha) => linha.email },
    {
      chave: 'perfil',
      titulo: 'Perfil',
      valor: (linha) => PERFIL_USUARIO_LABEL[linha.perfil],
    },
    {
      chave: 'situacao',
      titulo: 'Situacao',
      valor: (linha) => (linha.ativo ? 'Ativo' : 'Inativo'),
      ocultarNoCelular: true,
    },
  ];

  constructor() {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    const { busca, perfil, ativo } = this.filtros.getRawValue();

    this.servico
      .listar({
        ...(busca ? { busca } : {}),
        ...(perfil ? { perfil } : {}),
        ...(ativo === null ? {} : { ativo }),
        pagina: this.pagina(),
        tamanho: this.tamanho(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.usuarios.set(resposta.itens);
          this.total.set(resposta.total);
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.erro.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel carregar os usuarios.',
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

  novo(): void {
    void this.router.navigate(['/usuarios/novo']);
  }

  abrir(usuario: UsuarioResponse): void {
    void this.router.navigate(['/usuarios', usuario.id]);
  }
}
