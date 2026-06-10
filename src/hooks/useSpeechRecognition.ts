import { useEffect, useRef, useState, useCallback } from 'react';

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
  isListening: boolean;
  interimTranscript: string;
  finalTranscript: string;
  error: string | null;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  speak: (text: string) => void;
}

export function useSpeechRecognition(
  onFinalResult?: (text: string) => void
): UseSpeechRecognitionResult {

  const recognitionRef          = useRef<ISpeechRecognition | null>(null);
  const onFinalResultRef        = useRef(onFinalResult);
  const shouldKeepListeningRef  = useRef(false);

  // Guarda o último texto JÁ processado para não repetir o mesmo comando
  const lastProcessedTextRef    = useRef<string>('');

  // Trava o reinício enquanto a síntese de voz está falando,
  // evitando que o microfone capture a própria resposta do app
  const isSpeakingRef           = useRef(false);

  const [isListening, setIsListening]           = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript]   = useState('');
  const [error, setError]                       = useState<string | null>(null);

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
    recognition.lang            = 'pt-BR';
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');

      if (!shouldKeepListeningRef.current) return;

      // Se o speak() pausou o microfone, ele mesmo vai reativá-lo depois.
      // Não reiniciamos aqui para não competir com a lógica do speak.
      if (isSpeakingRef.current) return;

      try { recognition.start(); } catch { /* ignora */ }
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      let mensagem = 'Erro no reconhecimento de voz';
      switch (event.error) {
        case 'no-speech':
          // no-speech é normal no mobile — não exibe erro, apenas reinicia
          return;
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
          return;
      }
      setError(mensagem);
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let interim = '';
      let final   = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) setInterimTranscript(interim);

      if (final) {
        const textoFinal = final.trim();

        // Ignora se for idêntico ao último texto já processado
        // (acontece no mobile quando o buffer é reentregue após reinício)
        if (textoFinal === lastProcessedTextRef.current) return;

        lastProcessedTextRef.current = textoFinal;
        setInterimTranscript('');
        setFinalTranscript(textoFinal);
        onFinalResultRef.current?.(textoFinal);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      shouldKeepListeningRef.current = false;
      try { recognition.abort(); } catch { /* ignora */ }
      recognitionRef.current = null;
    };
  }, [isSupported]);

  const start = useCallback(() => {
    if (!recognitionRef.current) {
      setError('Web Speech API não suportada neste navegador');
      return;
    }
    if (isListening) return;

    // Limpa o último texto processado ao iniciar nova sessão de escuta
    lastProcessedTextRef.current  = '';
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
    lastProcessedTextRef.current   = '';
    try { recognitionRef.current.stop(); } catch { /* ignora */ }
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    // Para o reconhecimento IMEDIATAMENTE antes de falar
    // para o microfone não capturar a voz do próprio app
    isSpeakingRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignora */ }
    }

    const utterance  = new SpeechSynthesisUtterance(text);
    utterance.lang   = 'pt-BR';
    utterance.rate   = 1.05;
    utterance.pitch  = 1;
    utterance.volume = 1;

    const reativar = () => {
      isSpeakingRef.current = false;
      // Limpa o último texto processado para não bloquear o próximo comando
      lastProcessedTextRef.current = '';
      // Reativa o microfone somente se o usuário ainda quer ouvir
      if (shouldKeepListeningRef.current && recognitionRef.current) {
        // Pequena pausa extra para o áudio do sistema terminar completamente
        setTimeout(() => {
          if (!shouldKeepListeningRef.current) return;
          try { recognitionRef.current!.start(); } catch { /* ignora */ }
        }, 300);
      }
    };

    utterance.onend   = reativar;
    utterance.onerror = reativar;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  return {
    isListening, interimTranscript, finalTranscript, error,
    isSupported, start, stop, toggle, speak
  };
}