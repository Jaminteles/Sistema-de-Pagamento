/** Dados exibidos pelo modal de confirmacao. */
export interface DadosConfirmacao {
  titulo: string;
  mensagem: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** Acoes sensiveis (fechar periodo, aprovar lote) usam o estilo de alerta. */
  perigoso?: boolean;
}
