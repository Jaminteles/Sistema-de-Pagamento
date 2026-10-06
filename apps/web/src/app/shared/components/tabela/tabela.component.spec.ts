import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ColunaTabela } from './coluna-tabela';
import { TabelaComponent } from './tabela.component';

interface LinhaTeste {
  nome: string;
  valor: string;
}

const COLUNAS: readonly ColunaTabela<LinhaTeste>[] = [
  { chave: 'nome', titulo: 'Funcionario', valor: (linha) => linha.nome },
  { chave: 'valor', titulo: 'Liquido', valor: (linha) => linha.valor, alinhamento: 'fim' },
];

const LINHAS: readonly LinhaTeste[] = [
  { nome: 'Ana Souza', valor: 'R$ 1.234,56' },
  { nome: 'Bruno Lima', valor: 'R$ 987,00' },
];

describe('TabelaComponent', () => {
  function montar(entradas: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent<TabelaComponent<LinhaTeste>>(TabelaComponent);
    fixture.componentRef.setInput('colunas', COLUNAS);
    for (const [nome, valor] of Object.entries(entradas)) {
      fixture.componentRef.setInput(nome, valor);
    }
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TabelaComponent],
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('mostra o estado de carregando antes dos dados', () => {
    const fixture = montar({ carregando: true });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Carregando');
    expect((fixture.nativeElement as HTMLElement).querySelector('table')).toBeNull();
  });

  it('mostra o estado vazio quando nao ha linhas', () => {
    const fixture = montar({ dados: [], mensagemVazio: 'Nenhum lote em aberto.' });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nenhum lote em aberto.');
  });

  it('mostra o estado de erro com acao de recarregar', () => {
    const fixture = montar({ erro: 'Sem conexao com o servidor.' });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Sem conexao com o servidor.',
    );
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Tentar novamente');
  });

  it('renderiza cabecalhos e celulas a partir das colunas', () => {
    const fixture = montar({ dados: LINHAS });

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Funcionario');
    expect(texto).toContain('Liquido');
    expect(texto).toContain('Ana Souza');
    expect(texto).toContain('R$ 1.234,56');
    expect(fixture.componentInstance.chavesColunas()).toEqual(['nome', 'valor']);
  });

  it('nao emite selecao quando a tabela nao e selecionavel', () => {
    const fixture = montar({ dados: LINHAS });
    const selecionadas: LinhaTeste[] = [];
    fixture.componentInstance.selecionar.subscribe((linha) => selecionadas.push(linha));

    fixture.componentInstance.aoSelecionar(LINHAS[0]);

    expect(selecionadas).toEqual([]);
  });

  it('emite a linha clicada quando e selecionavel', () => {
    const fixture = montar({ dados: LINHAS, selecionavel: true });
    const selecionadas: LinhaTeste[] = [];
    fixture.componentInstance.selecionar.subscribe((linha) => selecionadas.push(linha));

    fixture.componentInstance.aoSelecionar(LINHAS[1]);

    expect(selecionadas).toEqual([LINHAS[1]]);
  });
});
