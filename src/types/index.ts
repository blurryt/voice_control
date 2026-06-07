export interface StockItem {
  id: string;
  nome: string;
  quantidade: number;
  unidade: string;
  categoria: string;
  ultimaAtualizacao: Date;
}

export type CommandAction =
  | 'adicionar'
  | 'remover'
  | 'definir'
  | 'consultar'
  | 'selecionar'
  | 'desconhecido';

export interface VoiceCommand {
  acao: CommandAction;
  quantidade?: number;
  itemNome?: string;
  textoOriginal: string;
}

export interface CommandLog {
  id: string;
  timestamp: Date;
  textoReconhecido: string;
  comando: VoiceCommand;
  sucesso: boolean;
  mensagem: string;
}

export type FeedbackType = 'sucesso' | 'erro' | 'aviso' | 'info';
