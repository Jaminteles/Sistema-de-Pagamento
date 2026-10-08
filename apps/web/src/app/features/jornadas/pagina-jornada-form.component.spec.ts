import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { CriarJornadaRequest, JornadaResponse } from '@sistema/shared';
import { of } from 'rxjs';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { JornadasService } from './jornadas.service';
import { PaginaJornadaFormComponent } from './pagina-jornada-form.component';

describe('PaginaJornadaFormComponent (T-021)', () => {
  let fixture: ComponentFixture<PaginaJornadaFormComponent>;
  let componente: PaginaJornadaFormComponent;
  let criadas: CriarJornadaRequest[];

  beforeEach(async () => {
    criadas = [];

    await TestBed.configureTestingModule({
      imports: [PaginaJornadaFormComponent],
      providers: [
        {
          provide: JornadasService,
          useValue: {
            criar: (dados: CriarJornadaRequest) => {
              criadas.push(dados);
              return of<JornadaResponse>({
                id: 'j-1',
                ativa: true,
                criadoEm: '2026-11-09T12:00:00.000Z',
                atualizadoEm: '2026-11-09T12:00:00.000Z',
                toleranciaMinutos: dados.toleranciaMinutos ?? 10,
                ...dados,
              });
            },
            buscar: () => of<JornadaResponse | null>(null),
            atualizar: () => of<JornadaResponse | null>(null),
          },
        },
        {
          provide: NotificacaoService,
          useValue: { sucesso: () => undefined, erro: () => undefined },
        },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginaJornadaFormComponent);
    componente = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('mostra a semana padrao com folga no fim de semana', () => {
    const semana = componente.semana();

    expect(semana).toHaveLength(7);
    expect(semana[0]).toMatchObject({
      rotulo: 'Segunda',
      trabalha: true,
      horario: '07:00 - 17:00',
      // 10h de jornada menos 1h de intervalo.
      duracao: '9h',
    });
    expect(semana[5]).toMatchObject({ trabalha: false, horario: 'Folga' });
    expect(semana[6]).toMatchObject({ trabalha: false, horario: 'Folga' });
  });

  it('refaz a pre-visualizacao ao mudar horario, intervalo e dias', async () => {
    componente.form.patchValue({ entrada: '08:00', saida: '12:30', intervaloMinutos: 30 });
    componente.alternarDia(6, true);
    await fixture.whenStable();

    const semana = componente.semana();
    expect(semana[0]).toMatchObject({ horario: '08:00 - 12:30', duracao: '4h' });
    expect(semana[5]).toMatchObject({ trabalha: true, horario: '08:00 - 12:30' });
  });

  it('indica a virada de meia-noite no turno da noite', async () => {
    componente.form.patchValue({ entrada: '22:00', saida: '06:00' });
    await fixture.whenStable();

    expect(componente.viraDia()).toBe(true);
    expect(componente.semana()[0]).toMatchObject({ duracao: '7h' });
  });

  it('envia horarios em minutos inteiros e carga semanal somada', () => {
    componente.form.patchValue({
      nome: 'Comercial',
      entrada: '07:00',
      saida: '17:00',
      intervaloMinutos: 60,
      cargaHoras: 44,
      cargaMinutos: 30,
      toleranciaMinutos: 10,
    });

    componente.salvar();

    expect(criadas).toEqual([
      {
        nome: 'Comercial',
        entradaMinutos: 420,
        saidaMinutos: 1020,
        intervaloMinutos: 60,
        cargaSemanalMinutos: 2670,
        toleranciaMinutos: 10,
        diasSemana: [1, 2, 3, 4, 5],
      },
    ]);
  });

  it('nao envia jornada sem dia de trabalho', () => {
    componente.form.patchValue({ nome: 'Sem dias' });
    for (const dia of [1, 2, 3, 4, 5]) {
      componente.alternarDia(dia, false);
    }

    componente.salvar();

    expect(criadas).toEqual([]);
  });

  it('nao envia formulario invalido', () => {
    componente.form.patchValue({ nome: null });

    componente.salvar();

    expect(criadas).toEqual([]);
  });
});
