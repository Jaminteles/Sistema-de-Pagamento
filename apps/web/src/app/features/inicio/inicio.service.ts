import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { HealthResponse } from '@sistema/shared';
import type { Observable } from 'rxjs';

/** Service de API da feature. Uma instancia por feature, como no padrao do projeto. */
@Injectable({ providedIn: 'root' })
export class InicioService {
  private readonly http = inject(HttpClient);

  /** O interceptor acrescenta o prefixo /api. */
  consultarSaude(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>('health');
  }
}
