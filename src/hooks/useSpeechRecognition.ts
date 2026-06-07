import { useEffect, useRef, useState, useCallback } from 'react';

// Tipos básicos para Web Speech API (não vêm com TypeScript por padrão)
interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: { transcript: string };
      isFinal: boolean;
    };
    length: number;
  };
}

interface ISpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface ISpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
}

type SpeechRecognitionConstructor = new () => ISpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface UseSpeechRecognitionResult {
  /** Está ouvindo o microfone agora? */
  isListening: boolean;
  /** Texto sendo reconhecido em tempo real (parcial) */
  interimTranscript: string;
  /** Último texto final reconhecido */
  finalTranscript: string;
  /** Mensagem de erro mais recente, se houver */
  error: string | null;
  /** API suportada pelo navegador? */
  isSupported: boolean;
  /** Inicia a escuta */
  start: () => void;
  /** Para a escuta */
  stop: () => void;
  /** Alterna entre iniciar/parar */
  toggle: () => void;
  /** Fala um texto via SpeechSynthesis (feedback auditivo) */
  speak: (text: string) => void;
}

/**
 * Hook para usar a Web Speech API.
 * Configurado para português do Brasil, reconhecimento contínuo,
 * com resultados parciais em tempo real.
 *
 * Cada vez que uma frase final é reconhecida, `finalTranscript` recebe
 * o texto (sempre como nova referência para forçar re-render mesmo
 * quando o texto é igual ao anterior).
 */
export function useSpeechRecognition(
  onFinalResult?: (text: string) => void
): UseSpeechRecognitionResult {

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const onFinalResultRef = useRef(onFinalResult);
  const shouldKeepListeningRef = useRef(false);

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Mantém a referência da callback sempre atualizada (sem reiniciar a API)
  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
  }, [onFinalResult]);

  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');

      // Em alguns navegadores, o `continuous` ainda assim para depois
      // de um período de silêncio. Reinicia se o usuário ainda queria ouvir.
      if (shouldKeepListeningRef.current) {
        try {
          recognition.start();
        } catch {
          // ignora se já estiver iniciando
        }
      }
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      let mensagem = 'Erro no reconhecimento de voz';
      switch (event.error) {
        case 'no-speech':
          mensagem = 'Nenhuma fala detectada';
          break;
        case 'audio-capture':
          mensagem = 'Microfone não encontrado';
          break;
        case 'not-allowed':
        case 'service-not-allowed':
          mensagem = 'Permissão de microfone negada';
          shouldKeepListeningRef.current = false;
          break;
        case 'network':
          mensagem = 'Erro de rede no reconhecimento';
          break;
        case 'aborted':
          // silencioso: foi parado intencionalmente
          return;
      }
      setError(mensagem);
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) {
        setInterimTranscript(interim);
      }

      if (final) {
        const textoFinal = final.trim();
        setInterimTranscript('');
        setFinalTranscript(textoFinal);
        onFinalResultRef.current?.(textoFinal);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      shouldKeepListeningRef.current = false;
      try {
        recognition.abort();
      } catch {
        // ignora
      }
      recognitionRef.current = null;
    };
  }, [isSupported]);

  const start = useCallback(() => {
    if (!recognitionRef.current) {
      setError('Web Speech API não suportada neste navegador');
      return;
    }
    if (isListening) return;

    shouldKeepListeningRef.current = true;
    try {
      recognitionRef.current.start();
    } catch (err) {
      console.error('Erro ao iniciar reconhecimento:', err);
      setError('Não foi possível iniciar o microfone');
    }
  }, [isListening]);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    shouldKeepListeningRef.current = false;
    try {
      recognitionRef.current.stop();
    } catch {
      // ignora
    }
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  return {
    isListening,
    interimTranscript,
    finalTranscript,
    error,
    isSupported,
    start,
    stop,
    toggle,
    speak
  };
}
