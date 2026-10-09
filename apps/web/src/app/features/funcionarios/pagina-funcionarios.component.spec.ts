import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  type FiltroFuncionarios,
  type FuncionarioResponse,
  type ObraResponse,
  type ParametrosPaginacao,
  PerfilUsuario,
  type RespostaPaginada,
  SituacaoFuncionario,
} from '@sistema/shared';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ObrasService } from '../obras/obras.service';
import { FuncionariosService } from './funcionarios.service';
import { PaginaFuncionariosComponent } from './pagina-funcionarios.component';

const OBRAS: ObraResponse[] = [
  {
    id: 'o-1',
    nome: 'Obra Centro',
    endereco: null,
    ativa: true,
    criadoEm: '2026-11-01T12:00:00.000Z',
    atualizadoEm: '2026-11-01T12:00:00.000Z',
  },
];

const FUNCIONARIOS: FuncionarioResponse[] = [
  {
    id: 'f-1',
    nome: 'Ana Lima',
    cpf: '529.982.247-25',
    cpfMascarado: false,
    matricula: '001',
    cargo: 'Pedreira',
    admissao: '2026-01-05',
    desligamento: null,
    situacao: SituacaoFuncionario.ATIVO,
    vinculoAtual: {
      id: 'v-1',
      funcionarioId: 'f-1',
      obraId: 'o-1',
      obraNome: 'Obra Centro',
      jornadaId: 'j-1',
      jornadaNome: 'Comercial',
      inicioVigencia: '2026-01-05',
      fimVigencia: null,
      criadoEm: '2026-01-05T12:00:00.000Z',
    },
    temDadosPagamento: true,
    criadoEm: '2026-01-05T12:00:00.000Z',
    atualizadoEm: '2026-01-05T12:00:00.000Z',
  },
  {
    id: 'f-2',
    nome: 'Bruno Melo',
    cpf: '***.444.777-**',
    cpfMascarado: true,
    matricula: '002',
    cargo: null,
    admissao: '2026-02-01',
    desligamento: null,
    situacao: SituacaoFuncionario.ATIVO,
    vinculoAtual: null,
    temDadosPagamento: false,
    criadoEm: '2026-02-01T12:00:00.000Z',
    atualizadoEm: '2026-02-01T12:00:00.000Z',
  },
];

describe('PaginaFuncionariosComponent (T-028)', () => {
  let fixture: ComponentFixture<PaginaFuncionariosComponent>;
  let componente: PaginaFuncionariosComponent;
  let chamadas: (FiltroFuncionarios & ParametrosPaginacao)[];
  let navegou: unknown[][];

  async function montar(perfil: PerfilUsuario): Promise<void> {
    chamadas = [];
    navegou = [];

    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [PaginaFuncionariosComponent],
      providers: [
        {
          provide: FuncionariosService,
          useValue: {
            listar: (filtro: FiltroFuncionarios & ParametrosPaginacao) => {
              chamadas.push(filtro);
              return of<RespostaPaginada<FuncionarioResponse>>({
                itens: FUNCIONARIOS,
                total: 2,
                pagina: 1,
                tamanho: 20,
              });
            },
          },
        },
        {
          provide: ObrasService,
          useValue: {
            listar: () =>
              of<RespostaPaginada<ObraResponse>>({
                itens: OBRAS,
                total: 1,
                pagina: 1,
                tamanho: 100,
              }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            temAlgumPerfil: (perfis: readonly PerfilUsuario[]) => perfis.includes(perfil),
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: (comandos: unknown[]) => {
              navegou.push(comandos);
              return Promise.resolve(true);
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginaFuncionariosComponent);
    componente = fixture.componentInstance;
    await fixture.whenStable();
  }

  it('carrega a primeira pagina e as obras do filtro ao abrir', async () => {
    await montar(PerfilUsuario.RH);

    expect(chamadas).toEqual([{ pagina: 1, tamanho: 20 }]);
    expect(componente.funcionarios().length).toBe(2);
    expect(componente.obras().length).toBe(1);
    expect(componente.carregando()).toBe(false);
  });

  it('envia somente os filtros preenchidos', async () => {
    await montar(PerfilUsuario.RH);

    componente.filtros.patchValue({
      busca: 'ana',
      situacao: SituacaoFuncionario.ATIVO,
      obraId: 'o-1',
    });
    componente.aplicarFiltros();

    expect(chamadas.at(-1)).toEqual({
      busca: 'ana',
      situacao: SituacaoFuncionario.ATIVO,
      obraId: 'o-1',
      pagina: 1,
      tamanho: 20,
    });
  });

  it('exibe o CPF exatamente como a API devolveu, inclusive mascarado', async () => {
    await montar(PerfilUsuario.ENCARREGADO);

    const coluna = componente.colunas.find((item) => item.chave === 'cpf');

    expect(coluna?.valor(FUNCIONARIOS[1])).toBe('***.444.777-**');
  });

  it('marca o pagamento pendente de quem nao tem chave nem conta (RN-08)', async () => {
    await montar(PerfilUsuario.RH);

    const coluna = componente.colunas.find((item) => item.chave === 'pagamento');

    expect(coluna?.valor(FUNCIONARIOS[0])).toBe('Cadastrado');
    expect(coluna?.valor(FUNCIONARIOS[1])).toBe('Pendente');
  });

  it('libera cadastro e importacao para ADMIN e RH', async () => {
    await montar(PerfilUsuario.ADMIN);
    expect(componente.podeCadastrar()).toBe(true);

    await montar(PerfilUsuario.RH);
    expect(componente.podeCadastrar()).toBe(true);
  });

  it('esconde cadastro e importacao do encarregado e do financeiro', async () => {
    for (const perfil of [PerfilUsuario.ENCARREGADO, PerfilUsuario.FINANCEIRO]) {
      await montar(perfil);

      expect(componente.podeCadastrar()).toBe(false);

      const html = (fixture.nativeElement as HTMLElement).innerHTML;
      expect(html).not.toContain('Novo funcionario');
      expect(html).not.toContain('Importar planilha');
    }
  });

  it('abre a importacao pela rota dedicada', async () => {
    await montar(PerfilUsuario.RH);

    componente.importar();

    expect(navegou).toContainEqual(['/funcionarios/importacao']);
  });
});
