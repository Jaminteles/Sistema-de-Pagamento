import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AtualizarObraRequest,
  CriarObraRequest,
  DefinirEncarregadosRequest,
  EncarregadoObraResponse,
  FiltroObras,
  ObraResponse,
  ParametrosPaginacao,
  RespostaPaginada,
} from '@sistema/shared';
import type { Observable } from 'rxjs';

/** Service de API da feature de obras/setores (RF-008, RF-003). */
@Injectable({ providedIn: 'root' })
export class ObrasService {
  private readonly http = inject(HttpClient);

  listar(filtro: FiltroObras & ParametrosPaginacao): Observable<RespostaPaginada<ObraResponse>> {
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

    return this.http.get<RespostaPaginada<ObraResponse>>('obras', { params });
  }

  buscar(id: string): Observable<ObraResponse> {
    return this.http.get<ObraResponse>(`obras/${id}`);
  }

  criar(dados: CriarObraRequest): Observable<ObraResponse> {
    return this.http.post<ObraResponse>('obras', dados);
  }

  atualizar(id: string, dados: AtualizarObraRequest): Observable<ObraResponse> {
    return this.http.patch<ObraResponse>(`obras/${id}`, dados);
  }

  /** RF-003. Disponivel somente para o ADMIN; a API recusa os outros perfis. */
  listarEncarregados(id: string): Observable<EncarregadoObraResponse[]> {
    return this.http.get<EncarregadoObraResponse[]>(`obras/${id}/encarregados`);
  }

  definirEncarregados(
    id: string,
    dados: DefinirEncarregadosRequest,
  ): Observable<EncarregadoObraResponse[]> {
    return this.http.put<EncarregadoObraResponse[]>(`obras/${id}/encarregados`, dados);
  }
}
