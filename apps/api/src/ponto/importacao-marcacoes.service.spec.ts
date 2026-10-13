import { BadRequestException } from '@nestjs/common';
import {
  IMPORTACAO_MARCACOES_MAXIMO_LINHAS,
  type LancarPontoResponse,
  OcorrenciaDia,
  OrigemMarcacao,
  PerfilUsuario,
  TipoMarcacao,
} from '@sistema/shared';
import type { UsuarioRequisicao } from '../auth/tipos';
import type { FuncionariosRepository } from '../funcionarios/funcionarios.repository';
import type { ArquivoEnviado } from '../funcionarios/importacao/arquivo-enviado';
import type { EscopoObraService } from '../obras/escopo-obra.service';
import { ImportacaoMarcacoesService } from './importacao-marcacoes.service';
import type { EntradaLancamento, EscopoLancamento, LancamentoService } from './lancamento.service';

/**
 * Importacao de marcacoes por CSV (T-042 / RF-019).
 *
 * O que estes testes travam: o arquivo passa pelo mesmo LancamentoService da
 * grade (e nao por um caminho mais permissivo), a origem gravada e IMPORTADO, o
 * escopo do encarregado continua saindo do usuario autenticado (RN-05) e linha
 * ruim nao derruba o arquivo inteiro.
 *
 * O arquivo e tratado como dado nao confiavel: celula com formula, cabecalho
 * faltando e arquivo gigante sao recusados antes de qualquer gravacao.
 */

const ANA = '019a0000-0000-7000-8000-00000000f001';
const BRUNO = '019a0000-0000-7000-8000-00000000f002';

function arquivo(conteudo: string, nome = 'marcacoes.csv'): ArquivoEnviado {
  const buffer = Buffer.from(conteudo, 'utf8');
  return { originalname: nome, mimetype: 'text/csv', size: buffer.length, buffer };
}

function usuario(perfil: PerfilUsuario): UsuarioRequisicao {
  return {
    id: '019a0000-0000-7000-8000-00000000b001',
    perfil,
    sessaoId: '019a0000-0000-7000-8000-00000000b901',
  };
}

describe('ImportacaoMarcacoesService', () => {
  let servico: ImportacaoMarcacoesService;
  let lancamento: { aplicar: jest.Mock };
  let aplicado: { entradas: EntradaLancamento[]; escopo: EscopoLancamento } | null;
  /** Recusa que o lancamento devolve, quando o teste quer exercitar isso. */
  let recusaDoLancamento: LancarPontoResponse | null;

  beforeEach(() => {
    aplicado = null;
    recusaDoLancamento = null;

    lancamento = {
      aplicar: jest.fn(
        (
          _usuario: UsuarioRequisicao,
          entradas: readonly EntradaLancamento[],
          escopo: EscopoLancamento,
        ) => {
          aplicado = { entradas: [...entradas], escopo };
          return Promise.resolve(
            recusaDoLancamento ?? { salvos: entradas.length, dias: [], erros: [] },
          );
        },
      ),
    };

    const funcionarios = {
      identificar: jest.fn(() =>
        Promise.resolve([
          { id: ANA, nome: 'Ana Lima', cpf: '52998224725', matricula: '001' },
          { id: BRUNO, nome: 'Bruno Melo', cpf: '11144477735', matricula: '002' },
        ]),
      ),
    } as unknown as FuncionariosRepository;

    const escopoObra = {
      obrasPermitidas: jest.fn(() => Promise.resolve(['019a0000-0000-7000-8000-00000000c001'])),
    } as unknown as EscopoObraService;

    servico = new ImportacaoMarcacoesService(
      lancamento as unknown as LancamentoService,
      funcionarios,
      escopoObra,
    );
  });

  describe('leitura do arquivo', () => {
    it('le o CSV com ponto e virgula e normaliza o cabecalho', async () => {
      const csv = [
        'Matricula;Data;Entrada;Saida_Intervalo;Retorno_Intervalo;Saida',
        '001;2026-12-07;07:00;11:00;12:00;17:00',
      ].join('\n');

      const resultado = await servico.importar(arquivo(csv), usuario(PerfilUsuario.RH));

      expect(resultado.totalLinhas).toBe(1);
      expect(resultado.erros).toEqual([]);
      expect(aplicado?.entradas).toHaveLength(1);
      expect(aplicado?.entradas[0]?.funcionarioId).toBe(ANA);
      expect(aplicado?.entradas[0]?.horarios[TipoMarcacao.ENTRADA]).toBe('07:00');
      expect(aplicado?.entradas[0]?.horarios[TipoMarcacao.SAIDA]).toBe('17:00');
    });

    it('le o CSV com virgula', async () => {
      const csv = ['matricula,data,entrada,saida', '002,07/12/2026,8:00,17:00:00'].join('\n');

      const resultado = await servico.importar(arquivo(csv), usuario(PerfilUsuario.RH));

      expect(resultado.erros).toEqual([]);
      expect(aplicado?.entradas[0]?.funcionarioId).toBe(BRUNO);
      // Data brasileira e hora com segundos sao normalizadas.
      expect(aplicado?.entradas[0]?.data.toISOString().slice(0, 10)).toBe('2026-12-07');
      expect(aplicado?.entradas[0]?.horarios[TipoMarcacao.ENTRADA]).toBe('08:00');
      expect(aplicado?.entradas[0]?.horarios[TipoMarcacao.SAIDA]).toBe('17:00');
    });

    it('identifica o funcionario pelo CPF quando nao ha matricula', async () => {
      const csv = ['cpf;data;entrada;saida', '529.982.247-25;2026-12-07;07:00;17:00'].join('\n');

      await servico.importar(arquivo(csv), usuario(PerfilUsuario.RH));

      expect(aplicado?.entradas[0]?.funcionarioId).toBe(ANA);
    });

    it('recusa arquivo que nao e CSV', async () => {
      await expect(
        servico.importar(arquivo('matricula;data', 'marcacoes.xlsx'), usuario(PerfilUsuario.RH)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa cabecalho sem a coluna data', async () => {
      await expect(
        servico.importar(arquivo('matricula;entrada;saida'), usuario(PerfilUsuario.RH)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa cabecalho sem matricula e sem cpf', async () => {
      await expect(
        servico.importar(arquivo('data;entrada;saida'), usuario(PerfilUsuario.RH)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa arquivo acima do teto de linhas', async () => {
      const linhas = ['matricula;data;entrada;saida'];
      for (let indice = 0; indice <= IMPORTACAO_MARCACOES_MAXIMO_LINHAS; indice += 1) {
        linhas.push('001;2026-12-07;07:00;17:00');
      }

      await expect(
        servico.importar(arquivo(linhas.join('\n')), usuario(PerfilUsuario.RH)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('validacao por linha', () => {
    it('recusa a linha e segue com as demais', async () => {
      const csv = [
        'matricula;data;entrada;saida',
        '999;2026-12-07;07:00;17:00',
        '001;31/02/2026;07:00;17:00',
        '001;2026-12-07;7h;17:00',
        '002;2026-12-07;07:00;17:00',
      ].join('\n');

      const resultado = await servico.importar(arquivo(csv), usuario(PerfilUsuario.RH));

      expect(resultado.totalLinhas).toBe(4);
      expect(resultado.comErro).toBe(3);
      expect(resultado.erros.map((erro) => erro.campo)).toEqual(['matricula', 'data', 'entrada']);
      expect(aplicado?.entradas).toHaveLength(1);
      expect(aplicado?.entradas[0]?.funcionarioId).toBe(BRUNO);
    });

    it('recusa a segunda linha do mesmo funcionario na mesma data', async () => {
      const csv = [
        'matricula;data;entrada;saida',
        '001;2026-12-07;07:00;17:00',
        '001;2026-12-07;08:00;18:00',
      ].join('\n');

      const resultado = await servico.importar(arquivo(csv), usuario(PerfilUsuario.RH));

      expect(resultado.comErro).toBe(1);
      expect(resultado.erros[0]?.linha).toBe(3);
      expect(aplicado?.entradas).toHaveLength(1);
    });

    it('aceita ocorrencia da lista e recusa ocorrencia invalida', async () => {
      const csv = [
        'matricula;data;ocorrencia',
        '001;2026-12-07;ATESTADO',
        '002;2026-12-07;ferias',
        '001;2026-12-08;DOENTE',
      ].join('\n');

      const resultado = await servico.importar(arquivo(csv), usuario(PerfilUsuario.RH));

      expect(resultado.comErro).toBe(1);
      expect(resultado.erros[0]?.campo).toBe('ocorrencia');
      expect(aplicado?.entradas[0]?.ocorrencia).toBe(OcorrenciaDia.ATESTADO);
      expect(aplicado?.entradas[1]?.ocorrencia).toBe(OcorrenciaDia.FERIAS);
    });

    it('nao devolve CPF na resposta nem nas mensagens de erro (RNF-05)', async () => {
      const csv = ['cpf;data;entrada;saida', '12345678901;2026-12-07;07:00;17:00'].join('\n');

      const resultado = await servico.importar(arquivo(csv), usuario(PerfilUsuario.RH));

      expect(resultado.comErro).toBe(1);
      expect(JSON.stringify(resultado)).not.toContain('12345678901');
    });
  });

  describe('gravacao', () => {
    it('grava com origem IMPORTADO e com o escopo do usuario autenticado', async () => {
      const csv = ['matricula;data;entrada;saida', '001;2026-12-07;07:00;17:00'].join('\n');

      await servico.importar(arquivo(csv), usuario(PerfilUsuario.RH));

      expect(aplicado?.escopo.origem).toBe(OrigemMarcacao.IMPORTADO);
      expect(aplicado?.escopo.obrasPermitidas).toEqual(['019a0000-0000-7000-8000-00000000c001']);
    });

    it('apaga a marcacao que o arquivo nao traz', async () => {
      const csv = ['matricula;data;entrada;saida', '001;2026-12-07;07:00;'].join('\n');

      await servico.importar(arquivo(csv), usuario(PerfilUsuario.RH));

      // Coluna vazia vira null, que apaga: o arquivo representa o dia inteiro.
      expect(aplicado?.entradas[0]?.horarios[TipoMarcacao.SAIDA]).toBeNull();
    });

    it('devolve a recusa do lancamento na linha do arquivo', async () => {
      recusaDoLancamento = {
        salvos: 0,
        dias: [],
        erros: [
          {
            funcionarioId: ANA,
            data: '2026-12-07',
            campo: 'DIA',
            motivo: 'Periodo 2026-12 esta fechado e nao aceita alteracao.',
          },
        ],
      };

      const csv = ['matricula;data;entrada;saida', '001;2026-12-07;07:00;17:00'].join('\n');
      const resultado = await servico.importar(arquivo(csv), usuario(PerfilUsuario.RH));

      expect(resultado.gravados).toBe(0);
      expect(resultado.comErro).toBe(1);
      expect(resultado.erros[0]?.linha).toBe(2);
      expect(resultado.erros[0]?.mensagem).toContain('fechado');
      expect(resultado.itens).toEqual([]);
    });
  });
});
