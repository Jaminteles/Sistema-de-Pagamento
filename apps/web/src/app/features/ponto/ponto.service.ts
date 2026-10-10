import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AbrirPeriodoRequest,
  GerarDiasResponse,
  GradeEquipeResponse,
  LancarEquipeRequest,
  LancarFuncionarioRequest,
  LancarPontoResponse,
  ParametrosPaginacao,
  PeriodoResponse,
  PontoFuncionarioResponse,
  RespostaPaginada,
  StatusPeriodo,
} from '@sistema/shared';
import type { Observable } from 'rxjs';

/**
 * Service de API do lancamento de ponto (RF-013 a RF-016).
 *
 * Nenhuma regra aqui: periodo, escopo do encarregado, ocorrencia e validacao
 * das marcacoes sao do back-end. O front envia o que foi digitado e exibe o que
 * a API responder, inclusive os erros por linha.
 */
@Injectable({ providedIn: 'root' })
export class PontoService {
  private readonly http = inject(HttpClient);

  listarPeriodos(
    filtro: { status?: StatusPeriodo } & ParametrosPaginacao = {},
  ): Observable<RespostaPaginada<PeriodoResponse>> {
    let params = new HttpParams();

    if (filtro.status) {
      params = params.set('status', filtro.status);
    }
    if (filtro.pagina !== undefined) {
      params = params.set('pagina', String(filtro.pagina));
    }
    if (filtro.tamanho !== undefined) {
      params = params.set('tamanho', String(filtro.tamanho));
    }

    return this.http.get<RespostaPaginada<PeriodoResponse>>('ponto/periodos', { params });
  }

  /** RF-013. Disponivel para ADMIN e RH; a API recusa os demais perfis. */
  abrirPeriodo(dados: AbrirPeriodoRequest): Observable<GerarDiasResponse> {
    return this.http.post<GerarDiasResponse>('ponto/periodos', dados);
  }

  grade(obraId: string, data: string): Observable<GradeEquipeResponse> {
    const params = new HttpParams().set('obraId', obraId).set('data', data);
    return this.http.get<GradeEquipeResponse>('ponto/grade', { params });
  }

  lancarEquipe(dados: LancarEquipeRequest): Observable<LancarPontoResponse> {
    return this.http.put<LancarPontoResponse>('ponto/grade', dados);
  }

  porFuncionario(
    funcionarioId: string,
    inicio: string,
    fim: string,
  ): Observable<PontoFuncionarioResponse> {
    const params = new HttpParams().set('inicio', inicio).set('fim', fim);
    return this.http.get<PontoFuncionarioResponse>(`ponto/funcionarios/${funcionarioId}`, {
      params,
    });
  }

  lancarFuncionario(
    funcionarioId: string,
    dados: LancarFuncionarioRequest,
  ): Observable<LancarPontoResponse> {
    return this.http.put<LancarPontoResponse>(`ponto/funcionarios/${funcionarioId}/dias`, dados);
  }
}
