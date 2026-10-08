import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AtualizarJornadaRequest,
  CriarJornadaRequest,
  FiltroJornadas,
  JornadaResponse,
  ParametrosPaginacao,
  RespostaPaginada,
} from '@sistema/shared';
import type { Observable } from 'rxjs';

/** Service de API da feature de jornadas (RF-009). */
@Injectable({ providedIn: 'root' })
export class JornadasService {
  private readonly http = inject(HttpClient);

  listar(
    filtro: FiltroJornadas & ParametrosPaginacao,
  ): Observable<RespostaPaginada<JornadaResponse>> {
    let params = new HttpParams();

    if (filtro.busca) {
      params = params.set('busca', filtro.busca);
    }
    if (filtro.ativa !== undefined) {
      params = params.set('ativa', String(filtro.ativa));
    }
    if (filtro.pagina !== undefined) {
      params = params.set('pagina', String(filtro.pagina));
    }
    if (filtro.tamanho !== undefined) {
      params = params.set('tamanho', String(filtro.tamanho));
    }

    return this.http.get<RespostaPaginada<JornadaResponse>>('jornadas', { params });
  }

  buscar(id: string): Observable<JornadaResponse> {
    return this.http.get<JornadaResponse>(`jornadas/${id}`);
  }

  criar(dados: CriarJornadaRequest): Observable<JornadaResponse> {
    return this.http.post<JornadaResponse>('jornadas', dados);
  }

  atualizar(id: string, dados: AtualizarJornadaRequest): Observable<JornadaResponse> {
    return this.http.patch<JornadaResponse>(`jornadas/${id}`, dados);
  }
}
