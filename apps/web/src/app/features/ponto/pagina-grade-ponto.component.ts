import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import {
  type ErroLancamentoResponse,
  type GradeEquipeResponse,
  type ItemLancamentoEquipeRequest,
  type ObraResponse,
  PerfilUsuario,
  STATUS_PERIODO_LABEL,
} from '@sistema/shared';
import { AuthService } from '../../core/auth/auth.service';
import { mensagemDoErro } from '../../core/http/erro-api';
import { NotificacaoService } from '../../core/notificacao/notificacao.service';
import { ConfirmacaoService } from '../../shared/components/modal-confirmacao/confirmacao.service';
import { EstadoConteudoComponent } from '../../shared/components/estado-conteudo/estado-conteudo.component';
import { ObrasService } from '../obras/obras.service';
import { CamposLancamentoComponent } from './campos-lancamento.component';
import { abreviacaoDoDia, competenciaDe, formatarData, hojeIso, somarDias } from './datas-ponto';
import {
  aplicarHorarioDaJornada,
  assinatura,
  criarGrupo,
  type GrupoLancamento,
  paraMarcacoes,
  replicarHorarios,
} from './lancamento-form';
import { PontoService } from './ponto.service';

/** Obras suficientes para o seletor; a empresa nao tem centenas de obras. */
const LIMITE_OBRAS = 100;

/**
 * Grade de lancamento de ponto por equipe e dia (T-036 / RF-013).
 *
 * Mobile-first porque e a tela que o encarregado usa no celular, na obra
 * (RNF-01): cada funcionario e um cartao com ocorrencia e quatro horarios, e a
 * barra de salvar fica fixa no rodape. Para dar conta de 30 pessoas em menos de
 * 5 minutos (RNF-02) existem tres atalhos: Enter pula para o proximo campo,
 * "horario da jornada" preenche entrada e saida de todo mundo e "replicar"
 * copia a primeira linha para as demais.
 *
 * A tela nao calcula nada: ordem, sobreposicao, intervalo minimo, periodo
 * fechado e escopo da obra sao decididos pela API, e os erros voltam por linha.
 */
@Component({
  selector: 'app-pagina-grade-ponto',
  imports: [
    CamposLancamentoComponent,
    EstadoConteudoComponent,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pagina-grade-ponto.component.scss',
  templateUrl: './pagina-grade-ponto.component.html',
})
export class PaginaGradePontoComponent {
  private readonly servico = inject(PontoService);
  private readonly obrasServico = inject(ObrasService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notificacao = inject(NotificacaoService);
  private readonly confirmacao = inject(ConfirmacaoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  private readonly area = viewChild<ElementRef<HTMLElement>>('area');

  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly salvando = signal(false);
  readonly grade = signal<GradeEquipeResponse | null>(null);
  readonly obras = signal<readonly ObraResponse[]>([]);
  /** Erros da ultima gravacao, agrupados por funcionario (T-038). */
  readonly errosPorFuncionario = signal<Record<string, ErroLancamentoResponse[]>>({});

  readonly rotuloStatus = STATUS_PERIODO_LABEL;

  readonly filtros = this.formBuilder.group({
    obraId: this.formBuilder.control<string | null>(null),
    data: this.formBuilder.nonNullable.control<string>(hojeIso()),
  });

  readonly linhas = new FormArray<GrupoLancamento>([]);

  /** Assinatura de cada linha ao carregar, para enviar somente o que mudou. */
  private originais: string[] = [];

  readonly podeAbrirPeriodo = computed(() =>
    this.auth.temAlgumPerfil([PerfilUsuario.ADMIN, PerfilUsuario.RH]),
  );

  readonly totalLinhas = computed(() => this.grade()?.linhas.length ?? 0);

  readonly semPeriodo = computed(() => {
    const grade = this.grade();
    return grade !== null && grade.periodo === null;
  });

  constructor() {
    this.carregarObras();
  }

  carregar(): void {
    const obraId = this.filtros.controls.obraId.value;
    if (!obraId) {
      return;
    }

    this.carregando.set(true);
    this.erro.set(null);
    this.errosPorFuncionario.set({});

    this.servico
      .grade(obraId, this.filtros.controls.data.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (grade) => {
          this.grade.set(grade);
          this.montarLinhas(grade);
          this.carregando.set(false);
        },
        error: (erro: unknown) => {
          this.grade.set(null);
          this.linhas.clear();
          this.erro.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel carregar a grade de ponto.',
          );
          this.carregando.set(false);
        },
      });
  }

  /** O encarregado recebe daqui somente as obras dele (RN-05), aplicado pela API. */
  private carregarObras(): void {
    this.obrasServico
      .listar({ ativa: true, pagina: 1, tamanho: LIMITE_OBRAS })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.obras.set(resposta.itens);
          const primeira = resposta.itens[0];
          if (primeira && this.filtros.controls.obraId.value === null) {
            this.filtros.controls.obraId.setValue(primeira.id);
            this.carregar();
          } else {
            this.carregando.set(false);
          }
        },
        error: (erro: unknown) => {
          this.obras.set([]);
          this.erro.set(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel carregar as obras.',
          );
          this.carregando.set(false);
        },
      });
  }

  private montarLinhas(grade: GradeEquipeResponse): void {
    this.linhas.clear();
    for (const linha of grade.linhas) {
      this.linhas.push(criarGrupo(linha.dia));
    }
    if (!grade.editavel) {
      this.linhas.disable();
    }
    this.originais = this.linhas.controls.map((grupo) => assinatura(grupo));
  }

  grupoDa(indice: number): GrupoLancamento {
    return this.linhas.at(indice);
  }

  errosDe(funcionarioId: string): readonly ErroLancamentoResponse[] {
    return this.errosPorFuncionario()[funcionarioId] ?? [];
  }

  mudarData(dias: number): void {
    this.filtros.controls.data.setValue(somarDias(this.filtros.controls.data.value, dias));
    this.carregar();
  }

  rotuloDoDia(): string {
    const data = this.filtros.controls.data.value;
    return `${abreviacaoDoDia(data)}, ${formatarData(data)}`;
  }

  /** RNF-02: preenche entrada e saida de toda a equipe pela jornada de cada um. */
  aplicarJornada(): void {
    const grade = this.grade();
    if (!grade) {
      return;
    }
    grade.linhas.forEach((linha, indice) => {
      aplicarHorarioDaJornada(this.linhas.at(indice), linha.jornada);
    });
  }

  /** RNF-02: copia os horarios da primeira linha para as demais. */
  replicarPrimeira(): void {
    const primeira = this.linhas.at(0);
    if (!primeira) {
      return;
    }
    this.linhas.controls.slice(1).forEach((grupo) => replicarHorarios(primeira, grupo));
  }

  /**
   * Enter pula para o proximo campo de hora da grade (RNF-02).
   *
   * A ordem usada e a do DOM, dentro da propria area da grade: o encarregado
   * desce a equipe sem tirar a mao do teclado e sem precisar de Tab.
   */
  avancar(evento: Event): void {
    const area = this.area()?.nativeElement;
    const atual = evento.target;
    if (!area || !(atual instanceof HTMLInputElement)) {
      return;
    }

    const campos = [
      ...area.querySelectorAll<HTMLInputElement>('input[data-hora]:not([readonly])'),
    ].filter((campo) => !campo.disabled);

    const proximo = campos[campos.indexOf(atual) + 1];
    proximo?.focus();
    proximo?.select();
  }

  salvar(): void {
    const grade = this.grade();
    if (!grade || this.salvando()) {
      return;
    }

    const itens = this.itensAlterados(grade);
    if (itens.length === 0) {
      this.notificacao.sucesso('Nada para salvar: nenhuma linha foi alterada.');
      return;
    }

    this.salvando.set(true);

    this.servico
      .lancarEquipe({ obraId: grade.obraId, data: grade.data, itens })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.salvando.set(false);
          this.errosPorFuncionario.set(this.agrupar(resposta.erros));

          if (resposta.erros.length === 0) {
            this.notificacao.sucesso(`${resposta.salvos} dia(s) de ponto gravado(s).`);
            this.carregar();
            return;
          }

          // Com linha recusada a tela nao recarrega: o encarregado precisa ver
          // o que digitou e o motivo da recusa para corrigir. As linhas que
          // foram gravadas deixam de contar como alteradas.
          this.notificacao.erro(
            `${resposta.salvos} gravado(s) e ${resposta.erros.length} recusado(s). Veja os avisos nas linhas.`,
          );
          this.marcarComoGravadas(
            grade,
            resposta.dias.map((dia) => dia.funcionarioId),
          );
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

  private itensAlterados(grade: GradeEquipeResponse): ItemLancamentoEquipeRequest[] {
    const itens: ItemLancamentoEquipeRequest[] = [];

    grade.linhas.forEach((linha, indice) => {
      const grupo = this.linhas.at(indice);
      if (grupo.disabled || assinatura(grupo) === this.originais[indice]) {
        return;
      }
      const valores = grupo.getRawValue();
      itens.push({
        funcionarioId: linha.funcionarioId,
        ocorrencia: valores.ocorrencia,
        observacao: valores.observacao === '' ? null : valores.observacao,
        ...paraMarcacoes(grupo),
      });
    });

    return itens;
  }

  /** Linha gravada deixa de ser "alterada", para a proxima gravacao nao repeti-la. */
  private marcarComoGravadas(grade: GradeEquipeResponse, funcionarios: readonly string[]): void {
    grade.linhas.forEach((linha, indice) => {
      if (funcionarios.includes(linha.funcionarioId)) {
        this.originais[indice] = assinatura(this.linhas.at(indice));
      }
    });
  }

  private agrupar(
    erros: readonly ErroLancamentoResponse[],
  ): Record<string, ErroLancamentoResponse[]> {
    const mapa: Record<string, ErroLancamentoResponse[]> = {};
    for (const erro of erros) {
      mapa[erro.funcionarioId] = [...(mapa[erro.funcionarioId] ?? []), erro];
    }
    return mapa;
  }

  /**
   * Abre o periodo da competencia do dia escolhido (RF-013).
   *
   * Sem periodo aberto nao existe onde gravar o ponto; so ADMIN e RH abrem, e a
   * API recusa os demais perfis.
   */
  async abrirPeriodo(): Promise<void> {
    const competencia = competenciaDe(this.filtros.controls.data.value);

    const confirmado = await this.confirmacao.confirmar({
      titulo: 'Abrir periodo',
      mensagem: `Abrir a competencia ${competencia} e gerar os dias de ponto dos funcionarios vinculados?`,
      textoConfirmar: 'Abrir periodo',
    });
    if (!confirmado) {
      return;
    }

    this.servico
      .abrirPeriodo({ competencia })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resposta) => {
          this.notificacao.sucesso(
            `Periodo ${resposta.periodo.competencia} aberto com ${resposta.diasCriados} dia(s) gerado(s).`,
          );
          this.carregar();
        },
        error: (erro: unknown) => {
          this.notificacao.erro(
            erro instanceof HttpErrorResponse
              ? mensagemDoErro(erro)
              : 'Nao foi possivel abrir o periodo.',
          );
        },
      });
  }

  abrirFuncionario(funcionarioId: string): void {
    void this.router.navigate(['/ponto/funcionarios', funcionarioId]);
  }
}
