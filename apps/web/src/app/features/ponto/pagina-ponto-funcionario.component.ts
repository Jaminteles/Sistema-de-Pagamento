import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import {
  type DiaPontoResponse,
  type ErroLancamentoResponse,
  type JornadaResumoResponse,
  minutosParaDuracao,
  type PontoFuncionarioResponse,
} from '@sistema/shared';
import { mensagemDoErro } from '../../core/http/erro-api';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { EstadoConteudoComponent } from '../../shared/components/estado-conteudo/estado-conteudo.component';
import { CamposLancamentoComponent } from './campos-lancamento.component';
import {
  abreviacaoDoDia,
  datasEntre,
  formatarData,
  formatarDiaMes,
  hojeIso,
  mesDe,
  mesVizinho,
  semanaDe,
  somarDias,
} from './datas-ponto';
import { assinatura, criarGrupo, type GrupoLancamento, paraMarcacoes } from './lancamento-form';
import { PontoService } from './ponto.service';

export type VisaoPonto = 'SEMANA' | 'MES';

/** Uma linha da tela: o dia do calendario com o que a API sabe sobre ele. */
interface LinhaDia {
  data: string;
  rotulo: string;
  diaMes: string;
  jornada: JornadaResumoResponse | null;
  feriado: string | null;
  dia: DiaPontoResponse | null;
}

/**
 * Ponto de um funcionario em visao semanal ou mensal (T-037 / RF-014).
 *
 * A tela lista todos os dias do intervalo, inclusive os que nunca foram
 * lancados: e assim que o RH enxerga a falha de lancamento e corrige na hora.
 * Dia que a API marcou como nao editavel entra desabilitado (RN-06 e RN-07); o
 * dia que ainda nao existe entra habilitado e, se nao puder receber lancamento,
 * a propria API devolve o motivo naquela linha.
 *
 * Os totais exibidos sao os que a API calculou (RF-020). A tela so formata.
 */
@Component({
  selector: 'app-pagina-ponto-funcionario',
  imports: [
    CamposLancamentoComponent,
    EstadoConteudoComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-ponto-funcionario.component.scss',
  templateUrl: './pagina-ponto-funcionario.component.html',
})
export class PaginaPontoFuncionarioComponent {
  private readonly servico = inject(PontoService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly notificacao = inject(NotificacaoService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly funcionarioId = this.rota.snapshot.paramMap.get('id') ?? '';

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly salvando = signal(false);
  readonly dados = signal<PontoFuncionarioResponse | null>(null);
  readonly linhasDia = signal<readonly LinhaDia[]>([]);
  readonly errosPorData = signal<Record<string, ErroLancamentoResponse[]>>({});

  readonly visao = signal<VisaoPonto>('SEMANA');
  readonly referencia = signal<string>(hojeIso());

  readonly linhas = new FormArray<GrupoLancamento>([]);

  private originais: string[] = [];

  readonly intervalo = computed(() =>
    this.visao() === 'SEMANA' ? semanaDe(this.referencia()) : mesDe(this.referencia()),
  );

  readonly rotuloIntervalo = computed(() => {
    const { inicio, fim } = this.intervalo();
    return `${formatarData(inicio)} a ${formatarData(fim)}`;
  });

  constructor() {
    this.carregar();
  }

  carregar(): void {
    if (this.funcionarioId === '') {
      this.erro.set('Funcionario nao informado.');
      this.carregando.set(false);
      return;
    }

    const { inicio, fim } = this.intervalo();

    this.carregando.set(true);
    this.erro.set(null);
    this.errosPorData.set({});

    this.servico
      .porFuncionario(this.funcionarioId, inicio, fim)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (dados) => {
          this.dados.set(dados);
          this.montarLinhas(dados);
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.dados.set(null);
          this.linhas.clear();
          this.linhasDia.set([]);
          this.erro.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel carregar o ponto do funcionario.',
          );
          this.carregando.set(false);
        },
      });
  }

  private montarLinhas(dados: PontoFuncionarioResponse): void {
    const porData = new Map(dados.dias.map((dia) => [dia.data, dia]));

    const linhas: LinhaDia[] = datasEntre(dados.inicio, dados.fim).map((data) => ({
      data,
      rotulo: `${abreviacaoDoDia(data)}, ${formatarData(data)}`,
      diaMes: formatarDiaMes(data),
      jornada: dados.jornadaPorDia[data] ?? null,
      feriado: dados.feriados[data] ?? null,
      dia: porData.get(data) ?? null,
    }));

    this.linhas.clear();
    for (const linha of linhas) {
      this.linhas.push(criarGrupo(linha.dia));
    }

    this.linhasDia.set(linhas);
    this.originais = this.linhas.controls.map((grupo) => assinatura(grupo));
  }

  grupoDa(indice: number): GrupoLancamento {
    return this.linhas.at(indice);
  }

  errosDe(data: string): readonly ErroLancamentoResponse[] {
    return this.errosPorData()[data] ?? [];
  }

  trocarVisao(visao: VisaoPonto): void {
    this.visao.set(visao);
    this.carregar();
  }

  /** Avanca ou volta uma semana ou um mes, conforme a visao. */
  navegar(sentido: -1 | 1): void {
    this.referencia.set(
      this.visao() === 'SEMANA'
        ? somarDias(this.referencia(), sentido * 7)
        : mesVizinho(this.referencia(), sentido),
    );
    this.carregar();
  }

  irParaHoje(): void {
    this.referencia.set(hojeIso());
    this.carregar();
  }

  duracao(minutos: number): string {
    return minutosParaDuracao(minutos);
  }

  salvar(): void {
    const dados = this.dados();
    if (!dados || this.salvando()) {
      return;
    }

    const dias = this.diasAlterados();
    if (dias.length === 0) {
      this.notificacao.sucesso('Nada para salvar: nenhum dia foi alterado.');
      return;
    }

    this.salvando.set(true);

    this.servico
      .lancarFuncionario(this.funcionarioId, { dias })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.salvando.set(false);
          this.errosPorData.set(this.agrupar(resposta.erros));

          if (resposta.erros.length === 0) {
            this.notificacao.sucesso(`${resposta.salvos} dia(s) gravado(s).`);
            this.carregar();
            return;
          }

          // Com dia recusado a tela nao recarrega: quem lancou precisa ver o
          // que digitou e o motivo da recusa. Os dias gravados deixam de contar
          // como alterados.
          this.notificacao.erro(
            `${resposta.salvos} gravado(s) e ${resposta.erros.length} recusado(s). Veja os avisos nos dias.`,
          );
          this.marcarComoGravados(resposta.dias.map((dia) => dia.data));
        },
        error: (erro: unknown) => {
          this.salvando.set(false);
          this.notificacao.erro(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel gravar o ponto.',
          );
        },
      });
  }

  private diasAlterados() {
    return this.linhasDia()
      .map((linha, indice) => ({ linha, grupo: this.linhas.at(indice), indice }))
      .filter(
        ({ grupo, indice }) => !grupo.disabled && assinatura(grupo) !== this.originais[indice],
      )
      .map(({ linha, grupo }) => {
        const valores = grupo.getRawValue();
        return {
          data: linha.data,
          ocorrencia: valores.ocorrencia,
          observacao: valores.observacao === '' ? null : valores.observacao,
          ...paraMarcacoes(grupo),
        };
      });
  }

  /** Dia gravado deixa de ser "alterado", para a proxima gravacao nao repeti-lo. */
  private marcarComoGravados(datas: readonly string[]): void {
    this.linhasDia().forEach((linha, indice) => {
      if (datas.includes(linha.data)) {
        this.originais[indice] = assinatura(this.linhas.at(indice));
      }
    });
  }

  private agrupar(
    erros: readonly ErroLancamentoResponse[],
  ): Record<string, ErroLancamentoResponse[]> {
    const mapa: Record<string, ErroLancamentoResponse[]> = {};
    for (const erro of erros) {
      mapa[erro.data] = [...(mapa[erro.data] ?? []), erro];
    }
    return mapa;
  }

  voltar(): void {
    void this.router.navigate(['/ponto']);
  }
}
