import { BadRequestException } from '@nestjs/common';
import { PerfilUsuario } from '@sistema/shared';
import ExcelJS from 'exceljs';
import { FuncionariosRepositorioEmMemoria } from '../../test/funcionarios-em-memoria';
import type { UsuarioRequisicao } from '../auth/tipos';
import type { FuncionariosRepository } from './funcionarios.repository';
import type { ArquivoEnviado } from './importacao/arquivo-enviado';
import { ImportacaoFuncionariosService } from './importacao-funcionarios.service';

const CPF_ANA = '52998224725';
const CPF_BRUNO = '11144477735';
const CPF_CARLA = '12345678909';
/** CPF que comeca com zero: a planilha perde o zero quando a coluna e numerica. */
const CPF_ZERO = '04587782068';

const CABECALHO = 'nome,cpf,matricula,cargo,admissao';

function usuario(perfil: PerfilUsuario, id = 'u-1'): UsuarioRequisicao {
  return { id, perfil, sessaoId: 's-1' };
}

function csv(...linhas: string[]): ArquivoEnviado {
  const conteudo = [CABECALHO, ...linhas].join('\n');
  const buffer = Buffer.from(conteudo, 'utf8');
  return {
    originalname: 'funcionarios.csv',
    mimetype: 'text/csv',
    size: buffer.length,
    buffer,
  };
}

async function xlsx(linhas: (string | number)[][]): Promise<ArquivoEnviado> {
  const planilha = new ExcelJS.Workbook();
  const aba = planilha.addWorksheet('Funcionarios');
  aba.addRow(['Nome', 'CPF', 'Matricula', 'Cargo', 'Admissão']);
  for (const linha of linhas) {
    aba.addRow(linha);
  }
  const bruto = await planilha.xlsx.writeBuffer();
  const buffer = Buffer.from(bruto);
  return {
    originalname: 'funcionarios.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  };
}

describe('ImportacaoFuncionariosService (T-027)', () => {
  let repositorio: FuncionariosRepositorioEmMemoria;
  let servico: ImportacaoFuncionariosService;

  beforeEach(() => {
    repositorio = new FuncionariosRepositorioEmMemoria();
    servico = new ImportacaoFuncionariosService(
      repositorio as unknown as FuncionariosRepository,
    );
  });

  describe('arquivo', () => {
    it('recusa extensao fora da lista', async () => {
      const arquivo = csv(`Ana Lima,${CPF_ANA},001,Pedreiro,2026-11-23`);
      arquivo.originalname = 'funcionarios.txt';

      await expect(
        servico.importar(arquivo, usuario(PerfilUsuario.RH), false),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa arquivo acima do limite de tamanho', async () => {
      const arquivo = csv(`Ana Lima,${CPF_ANA},001,Pedreiro,2026-11-23`);
      arquivo.size = 10 * 1024 * 1024;

      await expect(
        servico.importar(arquivo, usuario(PerfilUsuario.RH), false),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa cabecalho sem as colunas obrigatorias', async () => {
      const conteudo = Buffer.from('nome,cargo\nAna Lima,Pedreiro', 'utf8');

      await expect(
        servico.importar(
          { originalname: 'f.csv', mimetype: 'text/csv', size: conteudo.length, buffer: conteudo },
          usuario(PerfilUsuario.RH),
          false,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('importacao (RF-012)', () => {
    it('grava as linhas validas e devolve o relatorio', async () => {
      const relatorio = await servico.importar(
        csv(
          `Ana Lima,${CPF_ANA},001,Pedreiro,2026-11-23`,
          `Bruno Melo,${CPF_BRUNO},002,,23/11/2026`,
        ),
        usuario(PerfilUsuario.RH),
        false,
      );

      expect(relatorio.simulacao).toBe(false);
      expect(relatorio.totalLinhas).toBe(2);
      expect(relatorio.criados).toBe(2);
      expect(relatorio.comErro).toBe(0);
      expect(relatorio.erros).toEqual([]);
      expect(repositorio.criadosEmLote).toBe(2);
      // Data brasileira normalizada para ISO.
      expect(relatorio.itens[1]?.admissao).toBe('2026-11-23');
      expect(relatorio.itens[1]?.cargo).toBeNull();
    });

    it('a previa nao grava nada', async () => {
      const relatorio = await servico.importar(
        csv(`Ana Lima,${CPF_ANA},001,Pedreiro,2026-11-23`),
        usuario(PerfilUsuario.RH),
        true,
      );

      expect(relatorio.simulacao).toBe(true);
      expect(relatorio.criados).toBe(1);
      expect(repositorio.criadosEmLote).toBe(0);
      expect(repositorio.funcionarios).toHaveLength(0);
    });

    it('ignora quem ja existe por CPF ou matricula', async () => {
      repositorio.semear({ id: 'f-ana', nome: 'Ana Lima', cpf: CPF_ANA, matricula: '001' });

      const relatorio = await servico.importar(
        csv(
          `Ana Lima,${CPF_ANA},009,Pedreiro,2026-11-23`,
          `Carla Souza,${CPF_CARLA},001,Serralheira,2026-11-23`,
          `Bruno Melo,${CPF_BRUNO},002,,2026-11-23`,
        ),
        usuario(PerfilUsuario.RH),
        false,
      );

      expect(relatorio.ignorados).toBe(2);
      expect(relatorio.criados).toBe(1);
      expect(relatorio.itens.filter((item) => item.jaCadastrado)).toHaveLength(2);
    });

    it('aponta linha, campo e motivo de cada recusa', async () => {
      const relatorio = await servico.importar(
        csv(
          `Ana Lima,111.111.111-11,001,Pedreiro,2026-11-23`,
          `Jo,${CPF_BRUNO},002,,2026-11-23`,
          `Carla Souza,${CPF_CARLA},003,,31/02/2026`,
        ),
        usuario(PerfilUsuario.RH),
        false,
      );

      expect(relatorio.criados).toBe(0);
      expect(relatorio.comErro).toBe(3);
      expect(relatorio.erros).toEqual(
        expect.arrayContaining([
          { linha: 2, campo: 'cpf', mensagem: 'CPF invalido.' },
          { linha: 3, campo: 'nome', mensagem: 'Informe o nome completo.' },
          {
            linha: 4,
            campo: 'admissao',
            mensagem: 'Informe a admissao em AAAA-MM-DD ou DD/MM/AAAA.',
          },
        ]),
      );
    });

    it('recusa CPF e matricula repetidos dentro da planilha', async () => {
      const relatorio = await servico.importar(
        csv(
          `Ana Lima,${CPF_ANA},001,,2026-11-23`,
          `Ana Clone,${CPF_ANA},002,,2026-11-23`,
          `Bruno Melo,${CPF_BRUNO},001,,2026-11-23`,
        ),
        usuario(PerfilUsuario.RH),
        false,
      );

      expect(relatorio.criados).toBe(1);
      expect(relatorio.erros).toHaveLength(2);
      expect(relatorio.erros[0]?.campo).toBe('cpf');
      expect(relatorio.erros[1]?.campo).toBe('matricula');
    });

    it('ignora linha totalmente vazia', async () => {
      const relatorio = await servico.importar(
        csv(`Ana Lima,${CPF_ANA},001,,2026-11-23`, ',,,,', ''),
        usuario(PerfilUsuario.RH),
        false,
      );

      expect(relatorio.totalLinhas).toBe(1);
      expect(relatorio.erros).toEqual([]);
    });

    it('mascara o CPF do relatorio para perfil sem permissao (RNF-05)', async () => {
      const relatorio = await servico.importar(
        csv(`Ana Lima,${CPF_ANA},001,,2026-11-23`),
        usuario(PerfilUsuario.ENCARREGADO),
        true,
      );

      expect(relatorio.itens[0]?.cpf).toBe('***.982.247-**');
    });
  });

  describe('planilha xlsx', () => {
    it('le o arquivo e recompoe o zero a esquerda perdido na coluna numerica', async () => {
      const arquivo = await xlsx([['Ana Lima', Number(CPF_ZERO), 1, 'Pedreiro', '2026-11-23']]);

      const relatorio = await servico.importar(arquivo, usuario(PerfilUsuario.RH), false);

      expect(relatorio.erros).toEqual([]);
      expect(relatorio.itens[0]?.cpf).toBe('045.877.820-68');
      expect(relatorio.itens[0]?.matricula).toBe('1');
    });

    it('le data de celula de data', async () => {
      const arquivo = await xlsx([
        ['Bruno Melo', CPF_BRUNO, '002', 'Eletricista', '2026-11-23'],
      ]);

      const relatorio = await servico.importar(arquivo, usuario(PerfilUsuario.RH), false);

      expect(relatorio.itens[0]?.admissao).toBe('2026-11-23');
    });
  });
});
