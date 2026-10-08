import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { JornadaRegistro, JornadasRepository } from './jornadas.repository';
import { JornadasService } from './jornadas.service';

const AGORA = new Date('2026-11-09T12:00:00.000Z');

function registro(parcial: Partial<JornadaRegistro> & { id: string }): JornadaRegistro {
  return {
    nome: 'Comercial',
    entradaMinutos: 420,
    saidaMinutos: 1020,
    intervaloMinutos: 60,
    cargaSemanalMinutos: 2640,
    toleranciaMinutos: 10,
    diasSemana: [1, 2, 3, 4, 5],
    ativa: true,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
    ...parcial,
  };
}

describe('JornadasService (T-018)', () => {
  let banco: Map<string, JornadaRegistro>;
  let repositorio: {
    listar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorNome: jest.Mock;
    criar: jest.Mock;
    atualizar: jest.Mock;
  };
  let servico: JornadasService;

  beforeEach(() => {
    banco = new Map<string, JornadaRegistro>([
      ['j-comercial', registro({ id: 'j-comercial' })],
      [
        'j-noturna',
        registro({
          id: 'j-noturna',
          nome: 'Noturna',
          entradaMinutos: 1320,
          saidaMinutos: 360,
          diasSemana: [1, 2, 3, 4, 5, 6],
        }),
      ],
    ]);

    repositorio = {
      listar: jest.fn(() => Promise.resolve({ itens: [...banco.values()], total: banco.size })),
      buscarPorId: jest.fn((id: string) => Promise.resolve(banco.get(id) ?? null)),
      buscarPorNome: jest.fn((nome: string) => {
        const achada = [...banco.values()].find(
          (item) => item.nome.toLowerCase() === nome.toLowerCase(),
        );
        return Promise.resolve(achada ? { id: achada.id } : null);
      }),
      criar: jest.fn((dados: Partial<JornadaRegistro>) => {
        const criada = registro({ id: 'j-nova', ...dados });
        banco.set(criada.id, criada);
        return Promise.resolve(criada);
      }),
      atualizar: jest.fn((id: string, dados: Partial<JornadaRegistro>) => {
        const atual = banco.get(id);
        if (!atual) {
          return Promise.reject(new Error('inexistente'));
        }
        const atualizada = { ...atual, ...dados };
        banco.set(id, atualizada);
        return Promise.resolve(atualizada);
      }),
    };

    servico = new JornadasService(repositorio as unknown as JornadasRepository);
  });

  const jornadaValida = {
    nome: 'Sabado reduzido',
    entradaMinutos: 420,
    saidaMinutos: 720,
    intervaloMinutos: 0,
    cargaSemanalMinutos: 300,
    diasSemana: [6],
  };

  it('devolve os dias ordenados e sem repeticao', async () => {
    const criada = await servico.criar({ ...jornadaValida, diasSemana: [5, 1, 5, 3] });

    expect(criada.diasSemana).toEqual([1, 3, 5]);
  });

  it('usa a tolerancia padrao de 10 minutos quando nao informada (RN-02)', async () => {
    const criada = await servico.criar(jornadaValida);

    expect(criada.toleranciaMinutos).toBe(10);
  });

  it('respeita a tolerancia informada', async () => {
    const criada = await servico.criar({ ...jornadaValida, toleranciaMinutos: 0 });

    expect(criada.toleranciaMinutos).toBe(0);
  });

  it('aceita jornada que vira a meia-noite', async () => {
    const criada = await servico.criar({
      ...jornadaValida,
      nome: 'Turno da noite',
      entradaMinutos: 1320,
      saidaMinutos: 360,
      intervaloMinutos: 60,
    });

    expect(criada.entradaMinutos).toBe(1320);
    expect(criada.saidaMinutos).toBe(360);
  });

  it('recusa entrada igual a saida', async () => {
    await expect(
      servico.criar({ ...jornadaValida, entradaMinutos: 420, saidaMinutos: 420 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa intervalo maior ou igual a duracao da jornada', async () => {
    await expect(servico.criar({ ...jornadaValida, intervaloMinutos: 300 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('recusa nome repetido, ignorando maiusculas', async () => {
    await expect(servico.criar({ ...jornadaValida, nome: 'comercial' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('valida a consistencia sobre o resultado da alteracao, nao so sobre o enviado', async () => {
    // Intervalo de 60 min cabe na jornada atual (10h), mas nao numa de 30 min.
    await expect(servico.atualizar('j-comercial', { saidaMinutos: 450 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('desativa a jornada em vez de excluir', async () => {
    const atualizada = await servico.atualizar('j-comercial', { ativa: false });

    expect(atualizada.ativa).toBe(false);
  });

  it('exige pelo menos um campo na alteracao', async () => {
    await expect(servico.atualizar('j-comercial', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('responde 404 para jornada inexistente', async () => {
    await expect(servico.buscar('j-fantasma')).rejects.toBeInstanceOf(NotFoundException);
    await expect(servico.atualizar('j-fantasma', { ativa: true })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('pagina a listagem com os valores padrao', async () => {
    const resposta = await servico.listar({});

    expect(resposta).toMatchObject({ pagina: 1, tamanho: 20, total: 2 });
    expect(repositorio.listar).toHaveBeenCalledWith(
      expect.objectContaining({ pular: 0, limite: 20 }),
    );
  });
});
