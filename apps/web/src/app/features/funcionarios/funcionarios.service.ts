import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AtualizarFuncionarioRequest,
  AtualizarVinculoRequest,
  CriarFuncionarioRequest,
  CriarVinculoRequest,
  DadosPagamentoResponse,
  DefinirDadosPagamentoRequest,
  FiltroFuncionarios,
  FuncionarioResponse,
  ImportarFuncionariosResponse,
  ParametrosPaginacao,
  RespostaPaginada,
  VinculoFuncionarioResponse,
} from '@sistema/shared';
import type { Observable } from 'rxjs';

/**
 * Service de API da feature de funcionarios (RF-006, RF-007, RF-010, RF-012).
 *
 * Nenhuma regra aqui: mascara de CPF, escopo por obra e validacao sao do
 * back-end. O front apenas envia e exibe.
 */
@Injectable({ providedIn: 'root' })
export class FuncionariosService {
  private readonly http = inject(HttpClient);

  listar(
    filtro: FiltroFuncionarios & ParametrosPaginacao,
  ): Observable<RespostaPaginada<FuncionarioResponse>> {
    let params = new HttpParams();

    if (filtro.busca) {
      params = params.set('busca', filtro.busca);
    }
    if (filtro.situacao) {
      params = params.set('situacao', filtro.situacao);
    }
    if (filtro.obraId) {
      params = params.set('obraId', filtro.obraId);
    }
    if (filtro.comVinculoVigente !== undefined) {
      params = params.set('comVinculoVigente', String(filtro.comVinculoVigente));
    }
    if (filtro.pagina !== undefined) {
      params = params.set('pagina', String(filtro.pagina));
    }
    if (filtro.tamanho !== undefined) {
      params = params.set('tamanho', String(filtro.tamanho));
    }

    return this.http.get<RespostaPaginada<FuncionarioResponse>>('funcionarios', { params });
  }

  buscar(id: string): Observable<FuncionarioResponse> {
    return this.http.get<FuncionarioResponse>(`funcionarios/${id}`);
  }

  criar(dados: CriarFuncionarioRequest): Observable<FuncionarioResponse> {
    return this.http.post<FuncionarioResponse>('funcionarios', dados);
  }

  atualizar(id: string, dados: AtualizarFuncionarioRequest): Observable<FuncionarioResponse> {
    return this.http.patch<FuncionarioResponse>(`funcionarios/${id}`, dados);
  }

  /** RF-007. A API recusa os perfis sem permissao de ver dados bancarios. */
  buscarDadosPagamento(id: string): Observable<DadosPagamentoResponse> {
    return this.http.get<DadosPagamentoResponse>(`funcionarios/${id}/dados-pagamento`);
  }

  definirDadosPagamento(
    id: string,
    dados: DefinirDadosPagamentoRequest,
  ): Observable<DadosPagamentoResponse> {
    return this.http.put<DadosPagamentoResponse>(`funcionarios/${id}/dados-pagamento`, dados);
  }

  listarVinculos(id: string): Observable<VinculoFuncionarioResponse[]> {
    return this.http.get<VinculoFuncionarioResponse[]>(`funcionarios/${id}/vinculos`);
  }

  criarVinculo(id: string, dados: CriarVinculoRequest): Observable<VinculoFuncionarioResponse> {
    return this.http.post<VinculoFuncionarioResponse>(`funcionarios/${id}/vinculos`, dados);
  }

  atualizarVinculo(
    id: string,
    vinculoId: string,
    dados: AtualizarVinculoRequest,
  ): Observable<VinculoFuncionarioResponse> {
    return this.http.patch<VinculoFuncionarioResponse>(
      `funcionarios/${id}/vinculos/${vinculoId}`,
      dados,
    );
  }

  /**
   * RF-012. `simular` chama a previa, que valida a planilha e devolve o mesmo
   * relatorio sem gravar nada.
   */
  importar(arquivo: File, simular: boolean): Observable<ImportarFuncionariosResponse> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo, arquivo.name);

    const rota = simular ? 'funcionarios/importacao/previa' : 'funcionarios/importacao';
    return this.http.post<ImportarFuncionariosResponse>(rota, corpo);
  }
}
