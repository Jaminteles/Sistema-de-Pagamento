import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AtualizarUsuarioRequest,
  CriarUsuarioRequest,
  FiltroUsuarios,
  ParametrosPaginacao,
  RedefinirSenhaRequest,
  RespostaPaginada,
  UsuarioResponse,
} from '@sistema/shared';
import type { Observable } from 'rxjs';

/** Service de API da feature de usuarios (RF-002, RF-004). */
@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);

  listar(filtro: FiltroUsuarios & ParametrosPaginacao): Observable<RespostaPaginada<UsuarioResponse>> {
    let params = new HttpParams();

    if (filtro.busca) {
      params = params.set('busca', filtro.busca);
    }
    if (filtro.perfil) {
      params = params.set('perfil', filtro.perfil);
    }
    if (filtro.ativo !== undefined) {
      params = params.set('ativo', String(filtro.ativo));
    }
    if (filtro.pagina !== undefined) {
      params = params.set('pagina', String(filtro.pagina));
    }
    if (filtro.tamanho !== undefined) {
      params = params.set('tamanho', String(filtro.tamanho));
    }

    return this.http.get<RespostaPaginada<UsuarioResponse>>('usuarios', { params });
  }

  buscar(id: string): Observable<UsuarioResponse> {
    return this.http.get<UsuarioResponse>(`usuarios/${id}`);
  }

  criar(dados: CriarUsuarioRequest): Observable<UsuarioResponse> {
    return this.http.post<UsuarioResponse>('usuarios', dados);
  }

  atualizar(id: string, dados: AtualizarUsuarioRequest): Observable<UsuarioResponse> {
    return this.http.patch<UsuarioResponse>(`usuarios/${id}`, dados);
  }

  redefinirSenha(id: string, dados: RedefinirSenhaRequest): Observable<void> {
    return this.http.post<void>(`usuarios/${id}/redefinir-senha`, dados);
  }
}
