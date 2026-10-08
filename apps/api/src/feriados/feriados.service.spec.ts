import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AbrangenciaFeriado } from '@sistema/shared';
import { domingoDePascoa, feriadosNacionais } from './feriados-nacionais';
import {
  dataIsoParaDate,
  dateParaDataIso,
  type DadosFeriado,
  type FeriadoRegistro,
  type FeriadosRepository,
} from './feriados.repository';
import { anoCorrente, FeriadosService } from './feriados.service';

const AGORA = new Date('2026-11-09T12:00:00.000Z');

describe('feriadosNacionais (T-019)', () => {
  it('calcula o domingo de Pascoa', () => {
    // Datas conhecidas do calendario gregoriano.
    expect(domingoDePascoa(2027)).toEqual({ mes: 3, dia: 28 });
    expect(domingoDePascoa(2026)).toEqual({ mes: 4, dia: 5 });
  });

  it('inclui os feriados nacionais de lei, ordenados por data', () => {
    const itens = feriadosNacionais(2027);
    const datas = itens.map((item) => item.data);

    expect(datas).toEqual([...datas].sort((a, b) => a.localeCompare(b)));
    expect(datas).toContain('2027-01-01');
    expect(datas).toContain('2027-04-21');
    expect(datas).toContain('2027-11-20');
    expect(datas).toContain('2027-12-25');
    // Sexta-feira Santa: dois dias antes da Pascoa (28/03/2027).
    expect(datas).toContain('2027-03-26');
  });

  it('nao inclui ponto facultativo (Carnaval e Corpus Christi)', () => {
    const descricoes = feriadosNacionais(2027).map((item) => item.descricao.toLowerCase());

    expect(descricoes.some((item) => item.includes('carnaval'))).toBe(false);
    expect(descricoes.some((item) => item.includes('corpus'))).toBe(false);
  });
});

describe('anoCorrente', () => {
  it('usa o fuso de negocio America/Bahia (RNF-12)', () => {
    // 01/01 as 02:00 UTC e ainda 31/12 em America/Bahia (UTC-3).
    expect(anoCorrente(new Date('2027-01-01T02:00:00.000Z'))).toBe(2026);
    expect(anoCorrente(new Date('2027-01-01T05:00:00.000Z'))).toBe(2027);
  });
});

describe('FeriadosService (T-019)', () => {
  let banco: Map<string, FeriadoRegistro>;
  let repositorio: {
    listar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorDataEDescricao: jest.Mock;
    criar: jest.Mock;
    atualizar: jest.Mock;
    remover: jest.Mock;
    criarMuitosIgnorandoExistentes: jest.Mock;
  };
  let servico: FeriadosService;

  beforeEach(() => {
    banco = new Map<string, FeriadoRegistro>([
      [
        'f-natal',
        {
          id: 'f-natal',
          data: dataIsoParaDate('2027-12-25'),
          descricao: 'Natal',
          abrangencia: AbrangenciaFeriado.NACIONAL,
          uf: null,
          municipio: null,
          criadoEm: AGORA,
        },
      ],
    ]);

    repositorio = {
      listar: jest.fn((filtro: { ano: number }) =>
        Promise.resolve(
          [...banco.values()].filter(
            (item) => Number(dateParaDataIso(item.data).slice(0, 4)) === filtro.ano,
          ),
        ),
      ),
      buscarPorId: jest.fn((id: string) => Promise.resolve(banco.get(id) ?? null)),
      buscarPorDataEDescricao: jest.fn((data: Date, descricao: string) => {
        const achado = [...banco.values()].find(
          (item) =>
            dateParaDataIso(item.data) === dateParaDataIso(data) &&
            item.descricao.toLowerCase() === descricao.toLowerCase(),
        );
        return Promise.resolve(achado ? { id: achado.id } : null);
      }),
      criar: jest.fn((dados: DadosFeriado) => {
        const criado: FeriadoRegistro = { id: 'f-novo', criadoEm: AGORA, ...dados };
        banco.set(criado.id, criado);
        return Promise.resolve(criado);
      }),
      atualizar: jest.fn((id: string, dados: Partial<DadosFeriado>) => {
        const atual = banco.get(id);
        if (!atual) {
          return Promise.reject(new Error('inexistente'));
        }
        const atualizado = { ...atual, ...dados };
        banco.set(id, atualizado);
        return Promise.resolve(atualizado);
      }),
      remover: jest.fn((id: string) => {
        banco.delete(id);
        return Promise.resolve();
      }),
      criarMuitosIgnorandoExistentes: jest.fn((itens: readonly DadosFeriado[]) => {
        let criados = 0;
        for (const item of itens) {
          const chave = `${dateParaDataIso(item.data)}|${item.descricao}`;
          const existe = [...banco.values()].some(
            (linha) => `${dateParaDataIso(linha.data)}|${linha.descricao}` === chave,
          );
          if (!existe) {
            banco.set(chave, { id: chave, criadoEm: AGORA, ...item });
            criados += 1;
          }
        }
        return Promise.resolve(criados);
      }),
    };

    servico = new FeriadosService(repositorio as unknown as FeriadosRepository);
  });

  it('devolve a data no formato AAAA-MM-DD, sem deslocamento de fuso', async () => {
    const criado = await servico.criar({
      data: '2027-05-01',
      descricao: 'Dia do Trabalho',
      abrangencia: AbrangenciaFeriado.NACIONAL,
    });

    expect(criado.data).toBe('2027-05-01');
  });

  it('recusa feriado nacional com UF', async () => {
    await expect(
      servico.criar({
        data: '2027-05-01',
        descricao: 'Dia do Trabalho',
        abrangencia: AbrangenciaFeriado.NACIONAL,
        uf: 'BA',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige UF no feriado estadual e recusa municipio', async () => {
    await expect(
      servico.criar({
        data: '2027-07-02',
        descricao: 'Independencia da Bahia',
        abrangencia: AbrangenciaFeriado.ESTADUAL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      servico.criar({
        data: '2027-07-02',
        descricao: 'Independencia da Bahia',
        abrangencia: AbrangenciaFeriado.ESTADUAL,
        uf: 'ba',
        municipio: 'Salvador',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normaliza a UF em maiusculas no feriado estadual', async () => {
    const criado = await servico.criar({
      data: '2027-07-02',
      descricao: 'Independencia da Bahia',
      abrangencia: AbrangenciaFeriado.ESTADUAL,
      uf: 'ba',
    });

    expect(criado.uf).toBe('BA');
    expect(criado.municipio).toBeNull();
  });

  it('exige UF e municipio no feriado municipal', async () => {
    await expect(
      servico.criar({
        data: '2027-06-24',
        descricao: 'Sao Joao',
        abrangencia: AbrangenciaFeriado.MUNICIPAL,
        uf: 'BA',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa feriado repetido na mesma data e descricao', async () => {
    await expect(
      servico.criar({
        data: '2027-12-25',
        descricao: 'natal',
        abrangencia: AbrangenciaFeriado.NACIONAL,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('valida a coerencia sobre o resultado da alteracao', async () => {
    // So a abrangencia muda; sem UF gravada, o estadual fica invalido.
    await expect(
      servico.atualizar('f-natal', { abrangencia: AbrangenciaFeriado.ESTADUAL }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remove o feriado', async () => {
    await servico.remover('f-natal');

    expect(banco.has('f-natal')).toBe(false);
  });

  it('responde 404 em feriado inexistente', async () => {
    await expect(servico.buscar('f-fantasma')).rejects.toBeInstanceOf(NotFoundException);
    await expect(servico.remover('f-fantasma')).rejects.toBeInstanceOf(NotFoundException);
    await expect(servico.atualizar('f-fantasma', { descricao: 'Outro' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('exige pelo menos um campo na alteracao', async () => {
    await expect(servico.atualizar('f-natal', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('carga dos feriados nacionais', () => {
    it('cria os que faltam e nao duplica o que existe', async () => {
      const primeira = await servico.carregarNacionais({ ano: 2027 });

      // O Natal de 2027 ja estava no banco.
      expect(primeira.jaExistentes).toBe(1);
      expect(primeira.criados).toBe(feriadosNacionais(2027).length - 1);

      const segunda = await servico.carregarNacionais({ ano: 2027 });

      expect(segunda.criados).toBe(0);
      expect(segunda.jaExistentes).toBe(feriadosNacionais(2027).length);
    });
  });
});
