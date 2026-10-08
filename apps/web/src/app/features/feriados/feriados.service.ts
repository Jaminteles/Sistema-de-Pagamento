import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AtualizarFeriadoRequest,
  CarregarFeriadosNacionaisRequest,
  CarregarFeriadosNacionaisResponse,
  CriarFeriadoRequest,
  FeriadoResponse,
  FiltroFeriados,
} from '@sistema/shared';
import type { Observable } from 'rxjs';

/** Service de API da feature de feriados (RF-011). */
@Injectable({ providedIn: 'root' })
export class FeriadosService {
  private readonly http = inject(HttpClient);

  listar(filtro: FiltroFeriados): Observable<FeriadoResponse[]> {
    let params = new HttpParams();

    if (filtro.ano !== undefined) {
      params = params.set('ano', String(filtro.ano));
    }
    if (filtro.abrangencia) {
      params = params.set('abrangencia', filtro.abrangencia);
    }
    if (filtro.busca) {
      params = params.set('busca', filtro.busca);
    }

    return this.http.get<FeriadoResponse[]>('feriados', { params });
  }

  criar(dados: CriarFeriadoRequest): Observable<FeriadoResponse> {
    return this.http.post<FeriadoResponse>('feriados', dados);
  }

  atualizar(id: string, dados: AtualizarFeriadoRequest): Observable<FeriadoResponse> {
    return this.http.patch<FeriadoResponse>(`feriados/${id}`, dados);
  }

  remover(id: string): Observable<void> {
    return this.http.delete<void>(`feriados/${id}`);
  }

  /** Carga inicial dos feriados nacionais do ano. Idempotente na API. */
  carregarNacionais(
    dados: CarregarFeriadosNacionaisRequest,
  ): Observable<CarregarFeriadosNacionaisResponse> {
    return this.http.post<CarregarFeriadosNacionaisResponse>('feriados/nacionais', dados);
  }
}
