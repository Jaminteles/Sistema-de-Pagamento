import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  PerfilUsuario,
  type FiltroUsuarios,
  type ParametrosPaginacao,
  type RespostaPaginada,
  type UsuarioResponse,
} from '@sistema/shared';
import { type Observable, of, throwError } from 'rxjs';
import { PaginaUsuariosComponent } from './pagina-usuarios.component';
import { UsuariosService } from './usuarios.service';

const USUARIOS: UsuarioResponse[] = [
  {
    id: 'u-1',
    nome: 'Ana Admin',
    email: 'admin@empresa.com.br',
    perfil: PerfilUsuario.ADMIN,
    ativo: true,
    criadoEm: '2026-10-01T12:00:00.000Z',
    atualizadoEm: '2026-10-01T12:00:00.000Z',
  },
  {
    id: 'u-2',
    nome: 'Maria RH',
    email: 'rh@empresa.com.br',
    perfil: PerfilUsuario.RH,
    ativo: false,
    criadoEm: '2026-10-02T12:00:00.000Z',
    atualizadoEm: '2026-10-02T12:00:00.000Z',
  },
];

describe('PaginaUsuariosComponent (T-014)', () => {
  let fixture: ComponentFixture<PaginaUsuariosComponent>;
  let componente: PaginaUsuariosComponent;
  let chamadas: (FiltroUsuarios & ParametrosPaginacao)[];
  let navegou: unknown[][];
  let resposta: () => Observable<RespostaPaginada<UsuarioResponse>>;

  beforeEach(async () => {
    chamadas = [];
    navegou = [];
    resposta = () => of({ itens: USUARIOS, total: 2, pagina: 1, tamanho: 20 });

    await TestBed.configureTestingModule({
      imports: [PaginaUsuariosComponent],
      providers: [
        {
          provide: UsuariosService,
          useValue: {
            listar: (filtro: FiltroUsuarios & ParametrosPaginacao) => {
              chamadas.push(filtro);
              return resposta();
            },
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

    fixture = TestBed.createComponent(PaginaUsuariosComponent);
    componente = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('carrega a primeira pagina ao abrir', () => {
    expect(chamadas).toEqual([{ pagina: 1, tamanho: 20 }]);
    expect(componente.usuarios().length).toBe(2);
    expect(componente.total()).toBe(2);
    expect(componente.carregando()).toBe(false);
  });

  it('envia somente os filtros preenchidos', () => {
    componente.filtros.patchValue({ busca: 'maria', perfil: PerfilUsuario.RH, ativo: false });
    componente.aplicarFiltros();

    expect(chamadas.at(-1)).toEqual({
      busca: 'maria',
      perfil: PerfilUsuario.RH,
      ativo: false,
      pagina: 1,
      tamanho: 20,
    });
  });

  it('volta para a primeira pagina ao filtrar', () => {
    componente.mudarPagina({ pageIndex: 2, pageSize: 20, length: 2 });
    expect(chamadas.at(-1)).toMatchObject({ pagina: 3 });

    componente.aplicarFiltros();
    expect(chamadas.at(-1)).toMatchObject({ pagina: 1 });
  });

  it('respeita o tamanho de pagina escolhido', () => {
    componente.mudarPagina({ pageIndex: 1, pageSize: 50, length: 2 });

    expect(chamadas.at(-1)).toMatchObject({ pagina: 2, tamanho: 50 });
    expect(componente.tamanho()).toBe(50);
  });

  it('limpar filtros volta a consulta sem filtro', () => {
    componente.filtros.patchValue({ busca: 'maria' });
    componente.aplicarFiltros();

    componente.limparFiltros();

    expect(chamadas.at(-1)).toEqual({ pagina: 1, tamanho: 20 });
  });

  it('mostra o estado de erro quando a API falha', async () => {
    resposta = () =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { statusCode: 403, message: 'Acesso nao permitido para o seu perfil.' },
          }),
      );

    componente.carregar();
    await fixture.whenStable();

    expect(componente.erro()).toBe('Acesso nao permitido para o seu perfil.');
    expect(componente.carregando()).toBe(false);
  });

  it('as colunas mostram o rotulo do perfil e a situacao, sem dado sensivel', () => {
    const chaves = componente.colunas.map((coluna) => coluna.chave);
    expect(chaves).toEqual(['nome', 'email', 'perfil', 'situacao']);

    const perfil = componente.colunas.find((coluna) => coluna.chave === 'perfil');
    const situacao = componente.colunas.find((coluna) => coluna.chave === 'situacao');

    expect(perfil?.valor(USUARIOS[0])).toBe('Administrador');
    expect(situacao?.valor(USUARIOS[1])).toBe('Inativo');
  });

  it('navega para o cadastro e para a edicao', () => {
    componente.novo();
    componente.abrir(USUARIOS[0]);

    expect(navegou).toEqual([['/usuarios/novo'], ['/usuarios', 'u-1']]);
  });
});
