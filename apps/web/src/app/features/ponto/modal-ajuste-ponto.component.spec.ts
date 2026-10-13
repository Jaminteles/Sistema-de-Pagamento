import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  type AjustarDiaRequest,
  type AjustarDiaResponse,
  type AjustePontoResponse,
  CampoAjuste,
  type DiaPontoResponse,
  OcorrenciaDia,
  StatusEnvioDia,
  TipoMarcacao,
} from '@sistema/shared';
import { type Observable, of, throwError } from 'rxjs';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { ModalAjustePontoComponent } from './modal-ajuste-ponto.component';
import { PontoService } from './ponto.service';

/**
 * Modal de ajuste com justificativa e linha do tempo (T-045 / RF-017).
 *
 * O que estes testes travam: sem justificativa nada e enviado, o que a API
 * recusa aparece no modal (e nao um sucesso silencioso) e o historico fica
 * visivel junto do formulario.
 */

const DIA: DiaPontoResponse = {
  id: 'd-1',
  periodoId: 'p-1',
  funcionarioId: 'f-ana',
  data: '2026-12-07',
  ocorrencia: OcorrenciaDia.NORMAL,
  statusEnvio: StatusEnvioDia.NAO_ENVIADO,
  marcacoes: [
    {
      id: 'm-1',
      tipo: TipoMarcacao.ENTRADA,
      hora: '07:00',
      horario: '2026-12-07T10:00:00.000Z',
      origem: 'MANUAL',
      diaSeguinte: false,
    },
    {
      id: 'm-4',
      tipo: TipoMarcacao.SAIDA,
      hora: '17:00',
      horario: '2026-12-07T20:00:00.000Z',
      origem: 'MANUAL',
      diaSeguinte: false,
    },
  ],
  observacao: null,
  minutosTrabalhados: 600,
  minutosExtras50: 60,
  minutosExtras100: 0,
  minutosNoturnos: 0,
  minutosAtraso: 0,
  minutosFalta: 0,
  apuradoEm: '2026-12-07T20:05:00.000Z',
  editavel: true,
  atualizadoEm: '2026-12-07T20:05:00.000Z',
};

const HISTORICO: AjustePontoResponse[] = [
  {
    id: 'a-1',
    campo: CampoAjuste.SAIDA,
    valorAnterior: '17:00',
    valorNovo: '18:00',
    justificativa: 'Esqueceu de bater a saida; conferido com o encarregado.',
    usuarioNome: 'RH Teste',
    criadoEm: '2026-12-08T13:00:00.000Z',
  },
];

describe('ModalAjustePontoComponent (T-045)', () => {
  let fixture: ComponentFixture<ModalAjustePontoComponent>;
  let componente: ModalAjustePontoComponent;
  let enviados: { diaPontoId: string; dados: AjustarDiaRequest }[];
  let fechado: DiaPontoResponse | undefined;
  let fechou: boolean;
  let historico: () => Observable<AjustePontoResponse[]>;
  let ajuste: () => Observable<AjustarDiaResponse>;

  async function montar(): Promise<void> {
    enviados = [];
    fechado = undefined;
    fechou = false;

    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [ModalAjustePontoComponent],
      providers: [
        {
          provide: PontoService,
          useValue: {
            historicoDeAjustes: () => historico(),
            ajustarDia: (diaPontoId: string, dados: AjustarDiaRequest) => {
              enviados.push({ diaPontoId, dados });
              return ajuste();
            },
          },
        },
        {
          provide: MatDialogRef,
          useValue: {
            close: (valor: DiaPontoResponse | undefined) => {
              fechado = valor;
              fechou = true;
            },
          },
        },
        { provide: MAT_DIALOG_DATA, useValue: { dia: DIA, funcionarioNome: 'Ana Lima' } },
        {
          provide: NotificacaoService,
          useValue: { sucesso: () => undefined, erro: () => undefined },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModalAjustePontoComponent);
    componente = fixture.componentInstance;
    await fixture.whenStable();
  }

  beforeEach(() => {
    historico = () => of(HISTORICO);
    ajuste = () => of({ dia: { ...DIA, minutosTrabalhados: 660 }, historico: HISTORICO });
  });

  it('mostra a linha do tempo do dia ao abrir', async () => {
    await montar();

    expect(componente.historico()).toEqual(HISTORICO);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Historico de alteracoes');
    expect(texto).toContain('RH Teste');
    expect(texto).toContain('17:00');
    expect(texto).toContain('18:00');
  });

  it('segue utilizavel quando o historico falha', async () => {
    historico = () => throwError(() => new HttpErrorResponse({ status: 500 }));

    await montar();

    expect(componente.historico()).toEqual([]);
    expect(componente.carregandoHistorico()).toBe(false);
  });

  it('nao envia nada sem justificativa', async () => {
    await montar();

    componente.grupo.controls.saida.setValue('18:00');
    componente.salvar();
    await fixture.whenStable();

    expect(enviados).toHaveLength(0);
    expect(componente.justificativa.touched).toBe(true);
  });

  it('nao envia justificativa curta demais', async () => {
    await montar();

    componente.justificativa.setValue('ok');
    componente.salvar();
    await fixture.whenStable();

    expect(enviados).toHaveLength(0);
  });

  it('envia a justificativa com os horarios e fecha com o dia ajustado', async () => {
    await montar();

    componente.justificativa.setValue('Esqueceu de bater a saida; conferido na obra.');
    componente.grupo.controls.saida.setValue('18:00');
    componente.salvar();
    await fixture.whenStable();

    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.diaPontoId).toBe('d-1');
    expect(enviados[0]?.dados.justificativa).toBe('Esqueceu de bater a saida; conferido na obra.');
    expect(enviados[0]?.dados.saida).toBe('18:00');
    expect(enviados[0]?.dados.entrada).toBe('07:00');
    expect(fechado?.minutosTrabalhados).toBe(660);
  });

  it('nao envia horario quando a ocorrencia nao aceita marcacao (RF-015)', async () => {
    await montar();

    componente.justificativa.setValue('Apresentou atestado medico do dia.');
    componente.grupo.controls.ocorrencia.setValue(OcorrenciaDia.ATESTADO);
    componente.salvar();
    await fixture.whenStable();

    expect(enviados[0]?.dados.ocorrencia).toBe(OcorrenciaDia.ATESTADO);
    expect(enviados[0]?.dados.entrada).toBeUndefined();
    expect(enviados[0]?.dados.saida).toBeUndefined();
  });

  it('mostra o motivo da recusa da API e nao fecha o modal', async () => {
    ajuste = () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              statusCode: 409,
              message: 'Periodo 2026-12 esta fechado e nao aceita alteracao.',
            },
          }),
      );

    await montar();

    componente.justificativa.setValue('Correcao combinada com o encarregado.');
    componente.salvar();
    await fixture.whenStable();

    expect(componente.erro()).toContain('fechado');
    expect(fechou).toBe(false);
  });
});
