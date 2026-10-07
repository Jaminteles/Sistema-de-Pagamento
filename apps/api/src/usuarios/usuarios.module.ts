import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsuariosController } from './usuarios.controller';
import { UsuariosRepository } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';

/**
 * Gestao de usuarios e perfis (RF-002, RF-004).
 *
 * Importa o AuthModule pelo SessaoService: mudar perfil, desativar conta ou
 * redefinir senha precisa encerrar as sessoes abertas do usuario.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsuariosController],
  providers: [UsuariosService, UsuariosRepository],
  exports: [UsuariosService],
})
export class UsuariosModule {}
