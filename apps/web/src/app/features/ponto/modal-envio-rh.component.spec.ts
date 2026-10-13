import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  type EnviarPeriodoRhResponse,
  type PeriodoResponse,
  type ResumoEnvioRhResponse,
  StatusPeriodo,
} from '@sistema/shared';
import { type Observable, of, throwError } from 'rxjs';
import { ModalEnvioRhComponent } from './modal-envio-rh.component';
import { PontoService } from './ponto.service';

/**
 * Envio do periodo ao RH com resumo de pendencias (T-046 / RF-018).
 *
 * O que estes testes travam: o resumo aparece antes da confirmacao, o botao de
 * enviar morre quando a API diz que o usuario nao pode mais enviar (RN-06 e
 * RN-07) e a falha do envio nao fecha o modal como se tivesse dado certo.
 */

const PERIODO: PeriodoResponse = {
  id: 'p-1',
  competencia: '2026-12',
  dataInicio: '2026-12-01',
  dataFim: '2026-12-31',
  status: StatusPeriodo.ABERTO,
  fechadoEm: null,
  reabertoEm: null,
  criadoEm: '2026-12-01T12:00:00.000Z',
  atualizadoEm: '2026-12-01T12:00:00.000Z',
};

function resumo(parcial: Partial<ResumoEnvioRhResponse> = {}): ResumoEnvioRhResponse {
  return {
    periodo: PERIODO,
    obraId: 'o-1',
    obraNome: 'Obra Centro',
    funcionarios: 2,
    dias: 10,
    diasNaoEnviados: 8,
    diasEnviados: 2,
    totalPendencias: 3,
    pendencias: [
      {
        funcionarioId: 'f-ana',
        funcionarioNome: 'Ana Lima',
        matricula: '001',
        diasSemLancamento: ['2026-12-07', '2026-12-08'],
        diasIncompletos: [],
      },
      {
        funcionarioId: 'f-bruno',
        funcionarioNome: 'Bruno Melo',
        matricula: '002',
        diasSemLancamento: [],
        diasIncompletos: ['2026-12-09'],
      },
    ],
    podeEnviar: true,
    motivoBloqueio: null,
    ...parcial,
  };
}

describe('ModalEnvioRhComponent (T-046)', () => {
  let fixture: ComponentFixture<ModalEnvioRhComponent>;
  let componente: ModalEnvioRhComponent;
  let fechado: EnviarPeriodoRhResponse | undefined;
  let fechou: boolean;
  let enviosFeitos: { periodoId: string; obraId: string }[];
  let leitura: () => Observable<ResumoEnvioRhResponse>;
  let envio: () => Observable<EnviarPeriodoRhResponse>;

  async function montar(): Promise<void> {
    fechado = undefined;
    fechou = false;
    enviosFeitos = [];

    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [ModalEnvioRhComponent],
      providers: [
        {
          provide: PontoService,
          useValue: {
            resumoEnvio: () => leitura(),
            enviarAoRh: (periodoId: string, obraId: string) => {
              enviosFeitos.push({ periodoId, obraId });
              return envio();
            },
          },
        },
        {
          provide: MatDialogRef,
          useValue: {
            close: (valor: EnviarPeriodoRhResponse | undefined) => {
              fechado = valor;
              fechou = true;
            },
          },
        },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            periodoId: 'p-1',
            competencia: '2026-12',
            obraId: 'o-1',
            obraNome: 'Obra Centro',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModalEnvioRhComponent);
    componente = fixture.componentInstance;
    await fixture.whenStable();
  }

  beforeEach(() => {
    leitura = () => of(resumo());
    envio = () => of({ periodo: PERIODO, diasEnviados: 8, funcionarios: 2, totalPendencias: 3 });
  });

  it('lista as pendencias da equipe antes de confirmar', async () => {
    await montar();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Obra Centro');
    expect(texto).toContain('Ana Lima');
    expect(texto).toContain('Sem lancamento: 07/12, 08/12');
    expect(texto).toContain('Marcacao incompleta: 09/12');
    expect(componente.resumo()?.totalPendencias).toBe(3);
  });

  it('resume a lista longa de dias', async () => {
    await montar();

    expect(
      componente.dias([
        '2026-12-01',
        '2026-12-02',
        '2026-12-03',
        '2026-12-04',
        '2026-12-05',
        '2026-12-06',
        '2026-12-07',
        '2026-12-08',
      ]),
    ).toContain('e mais 2');
  });

  it('avisa quando nao ha pendencia', async () => {
    leitura = () => of(resumo({ totalPendencias: 0, pendencias: [] }));

    await montar();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Nenhuma pendencia na equipe',
    );
  });

  it('mostra o motivo e nao envia quando a API bloqueia (RN-06)', async () => {
    leitura = () =>
      of(
        resumo({
          podeEnviar: false,
          motivoBloqueio: 'Periodo 2026-12 ja foi enviado ao RH.',
        }),
      );

    await montar();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('ja foi enviado ao RH');

    const botao = (fixture.nativeElement as HTMLElement).querySelectorAll('button')[1];
    expect(botao?.disabled).toBe(true);
  });

  it('envia e fecha com o resultado', async () => {
    await montar();

    componente.enviar();
    await fixture.whenStable();

    expect(enviosFeitos).toEqual([{ periodoId: 'p-1', obraId: 'o-1' }]);
    expect(fechado?.diasEnviados).toBe(8);
  });

  it('mostra a falha do envio sem fechar o modal', async () => {
    envio = () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { statusCode: 409, message: 'Periodo 2026-12 esta fechado.' },
          }),
      );

    await montar();

    componente.enviar();
    await fixture.whenStable();

    expect(componente.erroEnvio()).toContain('fechado');
    expect(fechou).toBe(false);
  });

  it('mostra erro quando nao consegue ler o resumo', async () => {
    leitura = () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { statusCode: 404, message: 'Obra nao encontrada.' },
          }),
      );

    await montar();

    expect(componente.resumo()).toBeNull();
    expect(componente.erro()).toContain('Obra nao encontrada');
  });
});
