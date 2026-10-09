import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ImportarFuncionariosResponse } from '@sistema/shared';
import { of } from 'rxjs';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { FuncionariosService } from './funcionarios.service';
import { PaginaImportarFuncionariosComponent } from './pagina-importar-funcionarios.component';

function relatorio(parcial: Partial<ImportarFuncionariosResponse>): ImportarFuncionariosResponse {
  return {
    simulacao: true,
    totalLinhas: 1,
    criados: 1,
    ignorados: 0,
    comErro: 0,
    itens: [
      {
        linha: 2,
        nome: 'Ana Lima',
        cpf: '529.982.247-25',
        matricula: '001',
        cargo: 'Pedreira',
        admissao: '2026-11-23',
        jaCadastrado: false,
      },
    ],
    erros: [],
    ...parcial,
  };
}

describe('PaginaImportarFuncionariosComponent (T-030)', () => {
  let fixture: ComponentFixture<PaginaImportarFuncionariosComponent>;
  let componente: PaginaImportarFuncionariosComponent;
  let chamadas: { nome: string; simular: boolean }[];
  let resposta: ImportarFuncionariosResponse;

  const arquivo = new File(['nome,cpf\n'], 'funcionarios.csv', { type: 'text/csv' });

  beforeEach(async () => {
    chamadas = [];
    resposta = relatorio({});

    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [PaginaImportarFuncionariosComponent],
      providers: [
        {
          provide: FuncionariosService,
          useValue: {
            importar: (enviado: File, simular: boolean) => {
              chamadas.push({ nome: enviado.name, simular });
              return of({ ...resposta, simulacao: simular });
            },
          },
        },
        { provide: NotificacaoService, useValue: { sucesso: () => undefined, erro: () => undefined } },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginaImportarFuncionariosComponent);
    componente = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('nao envia nada sem arquivo escolhido', () => {
    componente.previsualizar();

    expect(chamadas).toEqual([]);
  });

  it('a pre-visualizacao chama a previa e nao habilita a confirmacao sozinha', () => {
    componente.arquivo.set(arquivo);
    componente.previsualizar();

    expect(chamadas).toEqual([{ nome: 'funcionarios.csv', simular: true }]);
    expect(componente.relatorio()?.simulacao).toBe(true);
    expect(componente.podeConfirmar()).toBe(true);
  });

  it('nao libera a confirmacao quando a previa nao tem nada a criar', () => {
    resposta = relatorio({ criados: 0, ignorados: 1, itens: [] });

    componente.arquivo.set(arquivo);
    componente.previsualizar();

    expect(componente.podeConfirmar()).toBe(false);
  });

  it('exige a previa antes de confirmar', () => {
    componente.arquivo.set(arquivo);

    expect(componente.podeConfirmar()).toBe(false);
  });

  it('confirma a importacao e bloqueia o reenvio', () => {
    componente.arquivo.set(arquivo);
    componente.previsualizar();
    componente.confirmar();

    expect(chamadas.map((item) => item.simular)).toEqual([true, false]);
    expect(componente.importado()).toBe(true);
    expect(componente.podeConfirmar()).toBe(false);
  });

  it('limpa o relatorio ao trocar de arquivo', () => {
    componente.arquivo.set(arquivo);
    componente.previsualizar();

    const entrada = document.createElement('input');
    componente.selecionar({ target: entrada } as unknown as Event);

    expect(componente.relatorio()).toBeNull();
    expect(componente.arquivo()).toBeNull();
    expect(componente.importado()).toBe(false);
  });

  it('mostra na tabela de erros a linha, o campo e o motivo', () => {
    resposta = relatorio({
      criados: 0,
      comErro: 1,
      itens: [],
      erros: [{ linha: 2, campo: 'cpf', mensagem: 'CPF invalido.' }],
    });

    componente.arquivo.set(arquivo);
    componente.previsualizar();
    fixture.detectChanges();

    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).toContain('CPF invalido.');
  });
});
