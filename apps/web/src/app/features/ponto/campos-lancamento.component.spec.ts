import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { OcorrenciaDia, TipoMarcacao } from '@sistema/shared';
import { CamposLancamentoComponent } from './campos-lancamento.component';
import { criarGrupo, type GrupoLancamento, paraMarcacoes } from './lancamento-form';

/**
 * Seletor de ocorrencia e exibicao dos erros de validacao (T-038).
 *
 * O componente nao decide nada: ele mostra a lista de ocorrencias de
 * packages/shared e os erros que a API devolveu para aquele dia.
 */
describe('CamposLancamentoComponent (T-038)', () => {
  let fixture: ComponentFixture<CamposLancamentoComponent>;
  let componente: CamposLancamentoComponent;
  let grupo: GrupoLancamento;

  async function montar(erros: Parameters<typeof componente.erros>[0] = []): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [CamposLancamentoComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CamposLancamentoComponent);
    componente = fixture.componentInstance;
    fixture.componentRef.setInput('grupo', grupo);
    fixture.componentRef.setInput('erros', erros);
    await fixture.whenStable();
  }

  beforeEach(() => {
    grupo = criarGrupo(null);
  });

  it('oferece todas as ocorrencias do dia (RF-015)', async () => {
    await montar();

    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).toContain('Ocorrencia');
    expect(componente.permiteHorario()).toBe(true);
  });

  it('avisa que a ocorrencia sem trabalho nao tem horario', async () => {
    grupo.controls.ocorrencia.setValue(OcorrenciaDia.ATESTADO);

    await montar();

    expect(componente.permiteHorario()).toBe(false);
    expect(componente.rotuloOcorrencia()).toBe('Atestado');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'nao tem marcacao de horario',
    );
  });

  it('marca o campo que a API recusou e lista o motivo', async () => {
    await montar([
      {
        funcionarioId: 'f-ana',
        data: '2026-12-07',
        campo: TipoMarcacao.RETORNO_INTERVALO,
        motivo: 'O intervalo ficou com 30min e a jornada exige no minimo 1h.',
      },
    ]);

    expect(componente.temErro(TipoMarcacao.RETORNO_INTERVALO)).toBe(true);
    expect(componente.temErro(TipoMarcacao.ENTRADA)).toBe(false);
    expect(componente.mensagens()).toEqual([
      'O intervalo ficou com 30min e a jornada exige no minimo 1h.',
    ]);
  });

  it('nao envia horario junto de ocorrencia sem trabalho', () => {
    grupo.patchValue({ entrada: '07:00', ocorrencia: OcorrenciaDia.FOLGA });

    expect(paraMarcacoes(grupo)).toEqual({});
  });

  it('transforma campo vazio em null, que apaga a marcacao', () => {
    grupo.patchValue({ entrada: '07:00' });

    expect(paraMarcacoes(grupo)).toEqual({
      entrada: '07:00',
      saidaIntervalo: null,
      retornoIntervalo: null,
      saida: null,
    });
  });
});
