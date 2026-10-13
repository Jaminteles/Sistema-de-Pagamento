import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  CampoAjuste,
  OcorrenciaDia,
  OrigemMarcacao,
  PerfilUsuario,
  StatusEnvioDia,
  StatusPeriodo,
  TipoMarcacao,
} from '@sistema/shared';
import type { ApuracaoService } from '../apuracao/apuracao.service';
import type { UsuarioRequisicao } from '../auth/tipos';
import { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import { dataIsoParaDate } from '../common/data/data-iso';
import { horaLocalParaInstante } from '../common/data/fuso-negocio';
import type { EscopoFuncionarioService } from '../funcionarios/escopo-funcionario.service';
import { AjusteService } from './ajuste.service';
import type { AjustarDiaDto } from './dto/ajustar-dia.dto';
import type {
  AjusteDiaGravavel,
  DiaPontoRegistro,
  PeriodoRegistro,
  PontoRepository,
  VinculoVigenteRegistro,
} from './ponto.repository';

/**
 * Ajuste de ponto ja lancado (T-040 / RF-017).
 *
 * O que estes testes travam: justificativa e historico sempre juntos, recusa
 * por estado do periodo (RN-06 e RN-07) e escopo do encarregado por id de rota
 * (RN-05). O caminho de um id de outra obra precisa morrer aqui, nao na tela.
 */

const DIA_ID = '019a0000-0000-7000-8000-0000000000d1';
const FUNCIONARIO = '019a0000-0000-7000-8000-00000000f001';
const DATA = '2026-12-08';

const PERIODO: PeriodoRegistro = {
  id: '019a0000-0000-7000-8000-00000000e001',
  competencia: '2026-12',
  dataInicio: dataIsoParaDate('2026-12-01'),
  dataFim: dataIsoParaDate('2026-12-31'),
  status: StatusPeriodo.ABERTO,
  fechadoEm: null,
  reabertoEm: null,
  criadoEm: new Date('2026-12-01T00:00:00.000Z'),
  atualizadoEm: new Date('2026-12-01T00:00:00.000Z'),
};

const VINCULO: VinculoVigenteRegistro = {
  funcionarioId: FUNCIONARIO,
  funcionarioNome: 'Ana Lima',
  matricula: '001',
  admissao: dataIsoParaDate('2026-01-05'),
  desligamento: null,
  obraId: '019a0000-0000-7000-8000-00000000c001',
  inicioVigencia: dataIsoParaDate('2026-01-05'),
  fimVigencia: null,
  jornada: {
    id: '019a0000-0000-7000-8000-00000000d001',
    nome: 'Comercial',
    entradaMinutos: 420,
    saidaMinutos: 1020,
    intervaloMinutos: 60,
    toleranciaMinutos: 10,
    diasSemana: [1, 2, 3, 4, 5],
  },
};

function hora(minutos: number): Date {
  return horaLocalParaInstante(DATA, minutos);
}

function diaGravado(parcial: Partial<DiaPontoRegistro> = {}): DiaPontoRegistro {
  return {
    id: DIA_ID,
    periodoId: PERIODO.id,
    funcionarioId: FUNCIONARIO,
    data: dataIsoParaDate(DATA),
    ocorrencia: OcorrenciaDia.NORMAL,
    statusEnvio: StatusEnvioDia.NAO_ENVIADO,
    minutosTrabalhados: 540,
    minutosExtras50: 0,
    minutosExtras100: 0,
    minutosNoturnos: 0,
    minutosAtraso: 0,
    minutosFalta: 0,
    apuradoEm: null,
    observacao: null,
    marcacoes: [
      { id: 'm1', tipo: TipoMarcacao.ENTRADA, horario: hora(420), origem: OrigemMarcacao.MANUAL },
      { id: 'm4', tipo: TipoMarcacao.SAIDA, horario: hora(1020), origem: OrigemMarcacao.MANUAL },
    ],
    atualizadoEm: new Date('2026-12-08T20:00:00.000Z'),
    ...parcial,
  };
}

function usuario(perfil: PerfilUsuario): UsuarioRequisicao {
  return {
    id: '019a0000-0000-7000-8000-00000000b001',
    perfil,
    sessaoId: '019a0000-0000-7000-8000-00000000b901',
  };
}

function dto(parcial: Partial<AjustarDiaDto> = {}): AjustarDiaDto {
  return {
    justificativa: 'Esqueceu de bater a saida; conferido com o encarregado.',
    ...parcial,
  };
}

describe('AjusteService', () => {
  let servico: AjusteService;
  let repositorio: {
    buscarDia: jest.Mock;
    buscarPeriodo: jest.Mock;
    vinculosNoIntervalo: jest.Mock;
    dias: jest.Mock;
    ajustar: jest.Mock;
    historicoDoDia: jest.Mock;
  };
  let escopo: { garantirAcesso: jest.Mock };
  let gravado: AjusteDiaGravavel | null;
  let dia: DiaPontoRegistro | null;
  let periodo: PeriodoRegistro;
  /** Liga a recusa do escopo do encarregado (RN-05) no teste que precisa dela. */
  let foraDoEscopo: boolean;

  beforeEach(() => {
    gravado = null;
    dia = diaGravado();
    periodo = { ...PERIODO };
    foraDoEscopo = false;

    repositorio = {
      buscarDia: jest.fn(() => Promise.resolve(dia)),
      buscarPeriodo: jest.fn(() => Promise.resolve(periodo)),
      vinculosNoIntervalo: jest.fn(() => Promise.resolve([VINCULO])),
      dias: jest.fn(() => Promise.resolve([dia])),
      ajustar: jest.fn((ajuste: AjusteDiaGravavel) => {
        gravado = ajuste;
        return Promise.resolve({
          ...(dia as DiaPontoRegistro),
          ocorrencia: ajuste.ocorrencia,
          observacao: ajuste.observacao,
          marcacoes: ajuste.marcacoes.map((marcacao, indice) => ({
            id: `n${String(indice)}`,
            tipo: marcacao.tipo,
            horario: marcacao.horario,
            origem: marcacao.origem,
          })),
        });
      }),
      historicoDoDia: jest.fn(() =>
        Promise.resolve([
          {
            id: 'a1',
            campo: CampoAjuste.SAIDA,
            valorAnterior: hora(1020),
            valorNovo: hora(1080),
            textoAnterior: null,
            textoNovo: null,
            justificativa: 'Esqueceu de bater a saida; conferido com o encarregado.',
            usuarioNome: 'RH Teste',
            criadoEm: new Date('2026-12-09T10:00:00.000Z'),
          },
        ]),
      ),
    };

    escopo = {
      garantirAcesso: jest.fn(() =>
        foraDoEscopo
          ? Promise.reject(new NotFoundException('Funcionario nao encontrado.'))
          : Promise.resolve(),
      ),
    };

    const apuracao = {
      apurar: (dias: DiaPontoRegistro[]) => Promise.resolve(dias),
    } as unknown as ApuracaoService;

    servico = new AjusteService(
      repositorio as unknown as PontoRepository,
      apuracao,
      escopo as unknown as EscopoFuncionarioService,
    );
  });

  describe('escopo e estado (RN-05, RN-06, RN-07)', () => {
    it('responde 404 quando o dia nao existe', async () => {
      dia = null;

      await expect(
        servico.ajustar(
          DIA_ID,
          dto({ saida: '18:00' }),
          usuario(PerfilUsuario.RH),
          new ColetorAuditoria(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('nao ajusta dia de funcionario fora do escopo do encarregado', async () => {
      foraDoEscopo = true;

      await expect(
        servico.ajustar(
          DIA_ID,
          dto({ saida: '18:00' }),
          usuario(PerfilUsuario.ENCARREGADO),
          new ColetorAuditoria(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repositorio.ajustar).not.toHaveBeenCalled();
    });

    it('recusa ajuste em periodo fechado, inclusive do RH (RN-07)', async () => {
      periodo = { ...PERIODO, status: StatusPeriodo.FECHADO };

      await expect(
        servico.ajustar(
          DIA_ID,
          dto({ saida: '18:00' }),
          usuario(PerfilUsuario.RH),
          new ColetorAuditoria(),
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repositorio.ajustar).not.toHaveBeenCalled();
    });

    it('recusa ajuste do encarregado depois do envio ao RH (RN-06)', async () => {
      dia = diaGravado({ statusEnvio: StatusEnvioDia.ENVIADO_RH });

      await expect(
        servico.ajustar(
          DIA_ID,
          dto({ saida: '18:00' }),
          usuario(PerfilUsuario.ENCARREGADO),
          new ColetorAuditoria(),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('permite o RH ajustar dia ja enviado ao RH', async () => {
      dia = diaGravado({ statusEnvio: StatusEnvioDia.ENVIADO_RH });

      await servico.ajustar(
        DIA_ID,
        dto({ saida: '18:00' }),
        usuario(PerfilUsuario.RH),
        new ColetorAuditoria(),
      );

      expect(repositorio.ajustar).toHaveBeenCalled();
    });
  });

  describe('historico (RF-017)', () => {
    it('registra o campo alterado com valor anterior, novo e justificativa', async () => {
      const resposta = await servico.ajustar(
        DIA_ID,
        dto({ saida: '18:00' }),
        usuario(PerfilUsuario.RH),
        new ColetorAuditoria(),
      );

      const ajuste = gravado as unknown as AjusteDiaGravavel;
      expect(ajuste.alteracoes).toHaveLength(1);
      expect(ajuste.alteracoes[0]?.campo).toBe(CampoAjuste.SAIDA);
      expect(ajuste.alteracoes[0]?.valorAnterior).toEqual(hora(1020));
      expect(ajuste.alteracoes[0]?.valorNovo).toEqual(hora(1080));
      expect(ajuste.justificativa).toBe('Esqueceu de bater a saida; conferido com o encarregado.');
      expect(resposta.historico[0]?.valorNovo).toBe('18:00');
    });

    it('marca a marcacao tocada como origem AJUSTE', async () => {
      await servico.ajustar(
        DIA_ID,
        dto({ saida: '18:00' }),
        usuario(PerfilUsuario.RH),
        new ColetorAuditoria(),
      );

      const ajuste = gravado as unknown as AjusteDiaGravavel;
      expect(ajuste.marcacoes.every((marcacao) => marcacao.origem === OrigemMarcacao.AJUSTE)).toBe(
        true,
      );
    });

    it('registra a troca de ocorrencia e apaga as marcacoes do dia', async () => {
      const resposta = await servico.ajustar(
        DIA_ID,
        dto({ ocorrencia: OcorrenciaDia.ATESTADO }),
        usuario(PerfilUsuario.RH),
        new ColetorAuditoria(),
      );

      const ajuste = gravado as unknown as AjusteDiaGravavel;
      const ocorrencia = ajuste.alteracoes.find((item) => item.campo === CampoAjuste.OCORRENCIA);
      expect(ocorrencia?.textoAnterior).toBe(OcorrenciaDia.NORMAL);
      expect(ocorrencia?.textoNovo).toBe(OcorrenciaDia.ATESTADO);
      expect(ajuste.marcacoes).toHaveLength(0);
      expect(ajuste.remover).toHaveLength(4);
      expect(resposta.dia.ocorrencia).toBe(OcorrenciaDia.ATESTADO);
    });

    it('registra a marcacao apagada', async () => {
      await servico.ajustar(
        DIA_ID,
        dto({ saida: null }),
        usuario(PerfilUsuario.RH),
        new ColetorAuditoria(),
      );

      const ajuste = gravado as unknown as AjusteDiaGravavel;
      const saida = ajuste.alteracoes.find((item) => item.campo === CampoAjuste.SAIDA);
      expect(saida?.valorAnterior).toEqual(hora(1020));
      expect(saida?.valorNovo).toBeNull();
      expect(saida?.marcacaoId).toBe('m4');
    });

    it('anota a acao para a auditoria sem gravar dado pessoal (RF-005)', async () => {
      const coletor = new ColetorAuditoria();

      await servico.ajustar(DIA_ID, dto({ saida: '18:00' }), usuario(PerfilUsuario.RH), coletor);

      const detalhes = coletor.lerDetalhes();
      expect(detalhes.entidadeId).toBe(DIA_ID);
      expect(detalhes.depois?.['camposAlterados']).toEqual([CampoAjuste.SAIDA]);
      expect(JSON.stringify(detalhes)).not.toContain('cpf');
    });
  });

  describe('validacao', () => {
    it('recusa ajuste que nao muda nada', async () => {
      await expect(
        servico.ajustar(
          DIA_ID,
          dto({ entrada: '07:00', saida: '17:00' }),
          usuario(PerfilUsuario.RH),
          new ColetorAuditoria(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repositorio.ajustar).not.toHaveBeenCalled();
    });

    it('recusa marcacao fora de ordem (RF-016)', async () => {
      await expect(
        servico.ajustar(
          DIA_ID,
          dto({ entrada: '18:00', saida: '17:00' }),
          usuario(PerfilUsuario.RH),
          new ColetorAuditoria(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa horario junto de ocorrencia sem trabalho (RF-015)', async () => {
      await expect(
        servico.ajustar(
          DIA_ID,
          dto({ ocorrencia: OcorrenciaDia.FALTA, entrada: '07:00' }),
          usuario(PerfilUsuario.RH),
          new ColetorAuditoria(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa intervalo menor que o da jornada (RF-016)', async () => {
      await expect(
        servico.ajustar(
          DIA_ID,
          dto({
            entrada: '07:00',
            saidaIntervalo: '11:00',
            retornoIntervalo: '11:30',
            saida: '17:00',
          }),
          usuario(PerfilUsuario.RH),
          new ColetorAuditoria(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('historico (consulta)', () => {
    it('aplica o escopo tambem na leitura do historico', async () => {
      foraDoEscopo = true;

      await expect(
        servico.historico(DIA_ID, usuario(PerfilUsuario.ENCARREGADO)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devolve a linha do tempo em HH:MM', async () => {
      const historico = await servico.historico(DIA_ID, usuario(PerfilUsuario.RH));

      expect(historico).toHaveLength(1);
      expect(historico[0]?.campo).toBe(CampoAjuste.SAIDA);
      expect(historico[0]?.valorAnterior).toBe('17:00');
      expect(historico[0]?.usuarioNome).toBe('RH Teste');
    });
  });
});
