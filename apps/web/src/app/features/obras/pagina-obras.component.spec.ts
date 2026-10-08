import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  type FiltroObras,
  type ObraResponse,
  type ParametrosPaginacao,
  PerfilUsuario,
  type RespostaPaginada,
} from '@sistema/shared';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PaginaObrasComponent } from './pagina-obras.component';
import { ObrasService } from './obras.service';

const OBRAS: ObraResponse[] = [
  {
    id: 'o-1',
    nome: 'Obra Centro',
    endereco: 'Rua A, 100',
    ativa: true,
    criadoEm: '2026-11-01T12:00:00.000Z',
    atualizadoEm: '2026-11-01T12:00:00.000Z',
  },
  {
    id: 'o-2',
    nome: 'Obra Litoral',
    endereco: null,
    ativa: false,
    criadoEm: '2026-11-02T12:00:00.000Z',
    atualizadoEm: '2026-11-02T12:00:00.000Z',
  },
];

describe('PaginaObrasComponent (T-020)', () => {
  let fixture: ComponentFixture<PaginaObrasComponent>;
  let componente: PaginaObrasComponent;
  let chamadas: (FiltroObras & ParametrosPaginacao)[];
  let navegou: unknown[][];

  async function montar(perfil: PerfilUsuario): Promise<void> {
    chamadas = [];
    navegou = [];

    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [PaginaObrasComponent],
      providers: [
        {
          provide: ObrasService,
          useValue: {
            listar: (filtro: FiltroObras & ParametrosPaginacao) => {
              chamadas.push(filtro);
              return of<RespostaPaginada<ObraResponse>>({
                itens: OBRAS,
                total: 2,
                pagina: 1,
                tamanho: 20,
              });
            },
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

    fixture = TestBed.createComponent(PaginaObrasComponent);
    componente = fixture.componentInstance;
    await fixture.whenStable();
  }

  it('carrega a primeira pagina ao abrir', async () => {
    await montar(PerfilUsuario.RH);

    expect(chamadas).toEqual([{ pagina: 1, tamanho: 20 }]);
    expect(componente.obras().length).toBe(2);
    expect(componente.carregando()).toBe(false);
  });

  it('envia somente os filtros preenchidos', async () => {
    await montar(PerfilUsuario.RH);

    componente.filtros.patchValue({ busca: 'centro', ativa: true });
    componente.aplicarFiltros();

    expect(chamadas.at(-1)).toEqual({
      busca: 'centro',
      ativa: true,
      pagina: 1,
      tamanho: 20,
    });
  });

  it('libera o cadastro para ADMIN e RH', async () => {
    await montar(PerfilUsuario.ADMIN);
    expect(componente.podeCadastrar()).toBe(true);

    await montar(PerfilUsuario.RH);
    expect(componente.podeCadastrar()).toBe(true);
  });

  it('esconde o cadastro do encarregado, que so consulta as obras dele', async () => {
    await montar(PerfilUsuario.ENCARREGADO);

    expect(componente.podeCadastrar()).toBe(false);

    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).not.toContain('Nova obra');
    expect(html).toContain('Obras vinculadas a voce');
  });
});
