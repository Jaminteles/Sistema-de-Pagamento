import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PAGINACAO_TAMANHO_PADRAO,
  PerfilUsuario,
  type RespostaPaginada,
  type UsuarioResponse,
} from '@sistema/shared';
import type { ColetorAuditoria } from '../common/auditoria/coletor-auditoria';
import { gerarHashSenha } from '../common/crypto/password.util';
import { MotivoRevogacao, SessaoService } from '../auth/sessao.service';
import type { AtualizarUsuarioDto } from './dto/atualizar-usuario.dto';
import type { CriarUsuarioDto } from './dto/criar-usuario.dto';
import type { ListarUsuariosQuery } from './dto/listar-usuarios.query';
import type { RedefinirSenhaDto } from './dto/redefinir-senha.dto';
import {
  SemAdministradorAtivoError,
  type UsuarioRegistro,
  UsuariosRepository,
} from './usuarios.repository';

function paraResposta(registro: UsuarioRegistro): UsuarioResponse {
  return {
    id: registro.id,
    nome: registro.nome,
    email: registro.email,
    perfil: registro.perfil,
    ativo: registro.ativo,
    criadoEm: registro.criadoEm.toISOString(),
    atualizadoEm: registro.atualizadoEm.toISOString(),
  };
}

/**
 * Gestao de usuarios e perfis (RF-002) e redefinicao de senha pelo
 * administrador (RF-004).
 *
 * Pela matriz da secao 3 do Levantamento de Requisitos, so o ADMIN gerencia
 * usuarios; o guard de perfil garante isso na borda. Aqui ficam as regras que
 * impedem o sistema de ficar sem administrador e um admin de se trancar fora.
 */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly repositorio: UsuariosRepository,
    private readonly sessoes: SessaoService,
  ) {}

  async listar(query: ListarUsuariosQuery): Promise<RespostaPaginada<UsuarioResponse>> {
    const pagina = query.pagina ?? 1;
    const tamanho = query.tamanho ?? PAGINACAO_TAMANHO_PADRAO;

    const { itens, total } = await this.repositorio.listar({
      ...(query.busca ? { busca: query.busca.trim() } : {}),
      ...(query.perfil ? { perfil: query.perfil } : {}),
      ...(query.ativo === undefined ? {} : { ativo: query.ativo }),
      pular: (pagina - 1) * tamanho,
      limite: tamanho,
    });

    return { itens: itens.map(paraResposta), total, pagina, tamanho };
  }

  async buscar(id: string): Promise<UsuarioResponse> {
    const usuario = await this.repositorio.buscarPorId(id);
    if (!usuario) {
      throw new NotFoundException('Usuario nao encontrado.');
    }
    return paraResposta(usuario);
  }

  async criar(dto: CriarUsuarioDto, coletor: ColetorAuditoria): Promise<UsuarioResponse> {
    const email = dto.email.trim().toLowerCase();

    if (await this.repositorio.buscarPorEmail(email)) {
      throw new ConflictException('Ja existe um usuario com este e-mail.');
    }

    const senhaHash = await gerarHashSenha(dto.senha);

    const criado = await this.repositorio.criar({
      nome: dto.nome.trim(),
      email,
      senhaHash,
      perfil: dto.perfil,
    });

    coletor.anotar({
      entidadeId: criado.id,
      depois: { nome: criado.nome, email: criado.email, perfil: criado.perfil, ativo: criado.ativo },
    });

    return paraResposta(criado);
  }

  /**
   * Alteracao de nome, perfil e situacao.
   *
   * Duas travas: ninguem altera o proprio perfil ou a propria situacao (evita
   * escalada e auto-bloqueio), e o ultimo ADMIN ativo nao pode ser rebaixado
   * nem desativado.
   */
  async atualizar(
    id: string,
    dto: AtualizarUsuarioDto,
    autorId: string,
    coletor: ColetorAuditoria,
  ): Promise<UsuarioResponse> {
    const atual = await this.repositorio.buscarPorId(id);
    if (!atual) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('Informe pelo menos um campo para alterar.');
    }

    const mudaPerfil = dto.perfil !== undefined && dto.perfil !== atual.perfil;
    const mudaSituacao = dto.ativo !== undefined && dto.ativo !== atual.ativo;

    if (id === autorId && (mudaPerfil || mudaSituacao)) {
      throw new BadRequestException(
        'Nao e possivel alterar o proprio perfil ou a propria situacao.',
      );
    }

    const perdeAdmin =
      atual.perfil === PerfilUsuario.ADMIN &&
      atual.ativo &&
      ((mudaPerfil && dto.perfil !== PerfilUsuario.ADMIN) || (mudaSituacao && dto.ativo === false));

    // Pre-checagem: devolve o erro bonito sem abrir transacao no caso comum.
    if (perdeAdmin && (await this.repositorio.contarAdminsAtivos(id)) === 0) {
      throw new BadRequestException('O sistema precisa de pelo menos um administrador ativo.');
    }

    let atualizado: UsuarioRegistro;
    try {
      atualizado = await this.repositorio.atualizar(
        id,
        {
          ...(dto.nome === undefined ? {} : { nome: dto.nome.trim() }),
          ...(dto.perfil === undefined ? {} : { perfil: dto.perfil }),
          ...(dto.ativo === undefined ? {} : { ativo: dto.ativo }),
        },
        // Duas requisicoes simultaneas poderiam passar pela pre-checagem; a
        // transacao do repositorio e quem garante a regra.
        perdeAdmin,
      );
    } catch (erro) {
      if (erro instanceof SemAdministradorAtivoError) {
        throw new BadRequestException(erro.message);
      }
      throw erro;
    }

    // Perfil novo ou conta desativada precisam valer agora, nao na expiracao do
    // access token: as sessoes abertas caem.
    if (mudaPerfil || (mudaSituacao && dto.ativo === false)) {
      await this.sessoes.revogarTodasDoUsuario(
        id,
        mudaSituacao && dto.ativo === false
          ? MotivoRevogacao.USUARIO_INATIVO
          : MotivoRevogacao.LOGOUT,
      );
    }

    // Alteracao de perfil ou de situacao e acao sensivel (RF-005); corrigir
    // apenas o nome nao e.
    if (!mudaPerfil && !mudaSituacao) {
      coletor.anotar({ ignorar: true });
      return paraResposta(atualizado);
    }

    coletor.anotar({
      entidadeId: id,
      antes: { nome: atual.nome, perfil: atual.perfil, ativo: atual.ativo },
      depois: {
        nome: atualizado.nome,
        perfil: atualizado.perfil,
        ativo: atualizado.ativo,
      },
    });

    return paraResposta(atualizado);
  }

  /** RF-004: redefinicao pelo administrador. Encerra as sessoes do usuario. */
  async redefinirSenha(
    id: string,
    dto: RedefinirSenhaDto,
    coletor: ColetorAuditoria,
  ): Promise<void> {
    const usuario = await this.repositorio.buscarPorId(id);
    if (!usuario) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    const senhaHash = await gerarHashSenha(dto.novaSenha);
    await this.repositorio.definirSenha(id, senhaHash);
    await this.sessoes.revogarTodasDoUsuario(id, MotivoRevogacao.SENHA);

    coletor.anotar({ entidadeId: id, depois: { redefinidaPor: 'ADMINISTRADOR' } });
  }
}
