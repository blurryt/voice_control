import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonPage,
  IonIcon, IonButton, IonButtons, IonList, IonItem, IonLabel,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  useIonAlert
} from '@ionic/react';
import {
  micCircle, refreshOutline, warningOutline, mic, micOff,
  checkmarkCircle, closeCircle, alertCircle, informationCircle,
  warning, cubeOutline, timeOutline, helpCircleOutline,
  radioButtonOn
} from 'ionicons/icons';

import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useStock } from '../hooks/useStock';
import { parseCommand } from '../services/commandParser';
import type { VoiceCommand, FeedbackType, StockItem } from '../types';

import './Home.css';

interface ExecutionResult {
  sucesso: boolean;
  mensagem: string;
}

const Home: React.FC = () => {
  const stock = useStock();
  const [feedback, setFeedback] = useState<{ mensagem: string; tipo: FeedbackType } | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const [presentAlert] = useIonAlert();

  // Capitaliza primeira letra para exibição
  const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

  const showFeedback = useCallback((mensagem: string, tipo: FeedbackType) => {
    setFeedback({ mensagem, tipo });
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setFeedback(null);
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  // Refs para sempre acessar o estado mais atual dentro do callback de voz
  const stockRef = useRef(stock);
  useEffect(() => { stockRef.current = stock; }, [stock]);

  /**
   * Executa um comando interpretado e retorna o resultado.
   */
  const executeCommand = useCallback((cmd: VoiceCommand): ExecutionResult => {
    const s = stockRef.current;
    let itemAlvo: StockItem | null = null;

    // Determina o item alvo
    if (cmd.itemNome) {
      const encontrado = s.findByName(cmd.itemNome);
      if (encontrado) {
        itemAlvo = encontrado;
        s.selectItem(encontrado.id);
      } else {
        return {
          sucesso: false,
          mensagem: `Item "${cmd.itemNome}" não encontrado no estoque.`
        };
      }
    } else {
      itemAlvo = s.selectedItem;
    }

    switch (cmd.acao) {
      case 'adicionar': {
        if (!itemAlvo) return { sucesso: false, mensagem: 'Selecione um item antes de adicionar.' };
        if (cmd.quantidade === undefined) return { sucesso: false, mensagem: 'Não entendi a quantidade.' };
        const atualizado = s.add(itemAlvo.id, cmd.quantidade);
        return {
          sucesso: true,
          mensagem: `Adicionados ${cmd.quantidade} a ${itemAlvo.nome}. Total: ${atualizado?.quantidade}.`
        };
      }

      case 'remover': {
        if (!itemAlvo) return { sucesso: false, mensagem: 'Selecione um item antes de remover.' };
        if (cmd.quantidade === undefined) return { sucesso: false, mensagem: 'Não entendi a quantidade.' };
        const resultado = s.subtract(itemAlvo.id, cmd.quantidade);
        if (!resultado.sufficient) {
          return {
            sucesso: false,
            mensagem: `Estoque insuficiente. Atual: ${resultado.item?.quantidade ?? 0}.`
          };
        }
        return {
          sucesso: true,
          mensagem: `Removidos ${cmd.quantidade} de ${itemAlvo.nome}. Total: ${resultado.item?.quantidade}.`
        };
      }

      case 'definir': {
        if (!itemAlvo) return { sucesso: false, mensagem: 'Selecione um item antes de definir.' };
        if (cmd.quantidade === undefined) return { sucesso: false, mensagem: 'Não entendi a quantidade.' };
        const atualizado = s.setQuantity(itemAlvo.id, cmd.quantidade);
        return {
          sucesso: true,
          mensagem: `${itemAlvo.nome} definido para ${atualizado?.quantidade}.`
        };
      }

      case 'consultar': {
        if (!itemAlvo) return { sucesso: false, mensagem: 'Diga o nome do item a consultar.' };
        return {
          sucesso: true,
          mensagem: `${itemAlvo.nome}: ${itemAlvo.quantidade} ${itemAlvo.unidade}.`
        };
      }

      case 'selecionar': {
        if (!itemAlvo) return { sucesso: false, mensagem: 'Diga o nome do item a selecionar.' };
        return {
          sucesso: true,
          mensagem: `${itemAlvo.nome} selecionado. Quantidade: ${itemAlvo.quantidade}.`
        };
      }

      default:
        return {
          sucesso: false,
          mensagem: 'Comando não reconhecido. Tente "adicionar 5" ou "remover 2".'
        };
    }
  }, []);

  /**
   * Callback acionado quando o reconhecimento completa uma frase.
   */
  const handleFinalTranscript = useCallback((texto: string) => {
    if (!texto || texto.trim().length === 0) return;

    const comando = parseCommand(texto);
    const resultado = executeCommand(comando);

    stockRef.current.addLog({
      timestamp: new Date(),
      textoReconhecido: texto,
      comando,
      sucesso: resultado.sucesso,
      mensagem: resultado.mensagem
    });

    showFeedback(resultado.mensagem, resultado.sucesso ? 'sucesso' : 'erro');
    speech.speak(resultado.mensagem);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executeCommand, showFeedback]);

  const speech = useSpeechRecognition(handleFinalTranscript);

  // Mostra erros do reconhecimento na UI
  useEffect(() => {
    if (speech.error) {
      showFeedback(speech.error, 'erro');
    }
  }, [speech.error, showFeedback]);

  const onResetClick = () => {
    presentAlert({
      header: 'Resetar estoque?',
      message: 'Os valores voltarão ao estado inicial.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Resetar',
          role: 'destructive',
          handler: () => stock.resetStock()
        }
      ]
    });
  };

  const feedbackIcon = (): string => {
    if (!feedback) return informationCircle;
    switch (feedback.tipo) {
      case 'sucesso': return checkmarkCircle;
      case 'erro': return alertCircle;
      case 'aviso': return warning;
      default: return informationCircle;
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle>
            <div className="title-wrapper">
              <IonIcon icon={micCircle} />
              <span>Voice Stock</span>
            </div>
          </IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onResetClick} title="Resetar estoque">
              <IonIcon slot="icon-only" icon={refreshOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent fullscreen className="content-bg">

        {/* Aviso de não suportado */}
        {!speech.isSupported && (
          <IonCard color="warning" className="aviso-card">
            <IonCardHeader>
              <IonCardTitle>
                <IonIcon icon={warningOutline} />
                <span> Navegador não suportado</span>
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              A Web Speech API não está disponível neste navegador. Use Chrome ou Edge no desktop, ou Chrome no Android.
            </IonCardContent>
          </IonCard>
        )}

        {/* Painel do item selecionado */}
        {stock.selectedItem ? (
          <div className="painel-selecionado">
            <div className="selecionado-label">ITEM ATIVO</div>
            <div className="selecionado-nome">{capitalize(stock.selectedItem.nome)}</div>
            <div className="selecionado-qtd">
              {stock.selectedItem.quantidade}
              <span className="unidade">{stock.selectedItem.unidade}</span>
            </div>
            <div className="selecionado-cat">{stock.selectedItem.categoria}</div>
          </div>
        ) : (
          <div className="painel-selecionado vazio">
            <div className="selecionado-label">NENHUM ITEM ATIVO</div>
            <div className="selecionado-dica">
              Toque em um item da lista ou diga<br />
              <strong>"selecionar parafuso"</strong>
            </div>
          </div>
        )}

        {/* Botão de microfone */}
        <div className="mic-container">
          <button
            className={`mic-button ${speech.isListening ? 'ativo' : ''}`}
            disabled={!speech.isSupported}
            onClick={speech.toggle}
            aria-label="Ativar reconhecimento de voz"
          >
            {speech.isListening && <div className="mic-pulse" />}
            {speech.isListening && <div className="mic-pulse delay" />}
            <IonIcon icon={speech.isListening ? mic : micOff} />
          </button>

          <div className="mic-status">
            {speech.isListening && <span className="status-on">Ouvindo...</span>}
            {!speech.isListening && speech.isSupported && (
              <span className="status-off">Toque para falar</span>
            )}
            {!speech.isSupported && <span className="status-erro">Indisponível</span>}
          </div>

          {(speech.interimTranscript || speech.finalTranscript) && (
            <div className="transcript-box">
              {speech.interimTranscript ? (
                <div className="interim">{speech.interimTranscript}</div>
              ) : (
                <div className="final">"{speech.finalTranscript}"</div>
              )}
            </div>
          )}
        </div>

        {/* Feedback */}
        {feedback && (
          <IonCard className={`feedback ${feedback.tipo}`}>
            <IonCardContent>
              <IonIcon icon={feedbackIcon()} />
              <span>{feedback.mensagem}</span>
            </IonCardContent>
          </IonCard>
        )}

        {/* Lista de itens */}
        <div className="secao-titulo">
          <IonIcon icon={cubeOutline} />
          <span>Estoque</span>
        </div>

        <IonList className="lista-itens">
          {stock.items.map(item => (
            <IonItem
              key={item.id}
              button
              lines="none"
              className={stock.selectedItem?.id === item.id ? 'ativo' : ''}
              onClick={() => {
                stock.selectItem(item.id);
                showFeedback(`Item ativo: ${item.nome}`, 'info');
              }}
            >
              <div
                slot="start"
                className={`badge-qtd ${item.quantidade === 0 ? 'zero' : item.quantidade < 20 ? 'baixo' : ''}`}
              >
                {item.quantidade}
              </div>
              <IonLabel>
                <h2>{capitalize(item.nome)}</h2>
                <p>{item.categoria} • {item.unidade}</p>
              </IonLabel>
              {stock.selectedItem?.id === item.id && (
                <IonIcon slot="end" icon={radioButtonOn} color="primary" />
              )}
            </IonItem>
          ))}
        </IonList>

        {/* Histórico de comandos */}
        {stock.logs.length > 0 && (
          <>
            <div className="secao-titulo">
              <IonIcon icon={timeOutline} />
              <span>Histórico de comandos</span>
              <IonButton fill="clear" size="small" onClick={stock.clearLogs}>
                Limpar
              </IonButton>
            </div>

            <IonList className="lista-logs">
              {stock.logs.slice(0, 8).map(log => (
                <IonItem key={log.id} lines="none">
                  <IonIcon
                    slot="start"
                    icon={log.sucesso ? checkmarkCircle : closeCircle}
                    color={log.sucesso ? 'success' : 'danger'}
                  />
                  <IonLabel>
                    <h3>"{log.textoReconhecido}"</h3>
                    <p>{log.mensagem}</p>
                    <p className="hora">
                      {log.timestamp.toLocaleTimeString('pt-BR')}
                    </p>
                  </IonLabel>
                </IonItem>
              ))}
            </IonList>
          </>
        )}

        {/* Card de ajuda */}
        <IonCard className="card-ajuda">
          <IonCardHeader>
            <IonCardTitle>
              <IonIcon icon={helpCircleOutline} />
              <span> Comandos disponíveis</span>
            </IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <div className="cmd-exemplo">
              <strong>"Adicionar 5"</strong>
              <span>incrementa o item ativo</span>
            </div>
            <div className="cmd-exemplo">
              <strong>"Remover 2"</strong>
              <span>decrementa o item ativo</span>
            </div>
            <div className="cmd-exemplo">
              <strong>"Definir 100"</strong>
              <span>define quantidade absoluta</span>
            </div>
            <div className="cmd-exemplo">
              <strong>"Selecionar parafuso"</strong>
              <span>escolhe um item por nome</span>
            </div>
            <div className="cmd-exemplo">
              <strong>"Adicionar 10 caixas"</strong>
              <span>seleciona e altera num só comando</span>
            </div>
            <div className="cmd-exemplo">
              <strong>"Quantos parafusos"</strong>
              <span>consulta a quantidade</span>
            </div>
          </IonCardContent>
        </IonCard>

      </IonContent>
    </IonPage>
  );
};

export default Home;
