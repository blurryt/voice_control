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

  const recognitionRef         = useRef<ISpeechRecognition | null>(null);
  const onFinalResultRef       = useRef(onFinalResult);
  const shouldKeepListeningRef = useRef(false);

  // Quando true, descarta qualquer resultado que chegar no onresult.
  // Não interrompemos o recognition — apenas ignoramos o que ele capturar
  // enquanto o app está falando. Isso evita toda race condition.
  const isSpeakingRef          = useRef(false);

  // Timestamp do último resultado final processado.
  // Só descartamos se o texto E o timestamp forem iguais (proteção contra
  // duplicatas do buffer mobile), mas nunca descartamos comandos diferentes.
  const lastResultRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

  const [isListening,       setIsListening]       = useState(false);
  const [interimTranscript, setInterimTranscript]  = useState('');
  const [finalTranscript,   setFinalTranscript]    = useState('');
  const [error,             setError]              = useState<string | null>(null);

  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
  }, [onFinalResult]);

  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!isSupported) return;

    const API = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!API) return;

    const recognition = new API();
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

      // Reinicia automaticamente apenas se o usuário quer continuar ouvindo
      // e o app NÃO está falando (o speak() reinicia ele mesmo quando termina)
      if (shouldKeepListeningRef.current && !isSpeakingRef.current) {
        try { recognition.start(); } catch { /* já está iniciando */ }
      }
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      switch (event.error) {
        case 'no-speech':
        case 'aborted':
          // Normais no mobile — silencioso
          return;
        case 'not-allowed':
        case 'service-not-allowed':
          setError('Permissão de microfone negada');
          shouldKeepListeningRef.current = false;
          return;
        case 'audio-capture':
          setError('Microfone não encontrado');
          return;
        case 'network':
          setError('Erro de rede no reconhecimento');
          return;
      }
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      // Se o app está falando, descarta tudo que chegar — não interrompe,
      // apenas ignora para não processar a própria voz como comando
      if (isSpeakingRef.current) {
        setInterimTranscript('');
        return;
      }

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

      if (interim) {
        setInterimTranscript(interim);
      }

      if (final) {
        const texto = final.trim();
        const agora = Date.now();

        // Descarta apenas se for o mesmo texto dentro de 2 segundos
        // (proteção contra buffer duplicado do mobile)
        const { text: ultimoTexto, time: ultimoTempo } = lastResultRef.current;
        if (texto === ultimoTexto && agora - ultimoTempo < 2000) return;

        lastResultRef.current = { text: texto, time: agora };
        setInterimTranscript('');
        setFinalTranscript(texto);
        onFinalResultRef.current?.(texto);
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
    shouldKeepListeningRef.current = true;
    lastResultRef.current = { text: '', time: 0 };
    try {
      recognitionRef.current.start();
    } catch {
      setError('Não foi possível iniciar o microfone');
    }
  }, [isListening]);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    shouldKeepListeningRef.current = false;
    lastResultRef.current = { text: '', time: 0 };
    try { recognitionRef.current.stop(); } catch { /* ignora */ }
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    // Ativa o filtro de resultados — o recognition continua rodando,
    // mas qualquer resultado que chegar será descartado no onresult
    isSpeakingRef.current = true;

    const utterance  = new SpeechSynthesisUtterance(text);
    utterance.lang   = 'pt-BR';
    utterance.rate   = 1.05;
    utterance.pitch  = 1;
    utterance.volume = 1;

    const onTerminou = () => {
      // Aguarda 500ms após o fim da fala antes de reativar o microfone,
      // tempo suficiente para o áudio do alto-falante dissipar
      setTimeout(() => {
        isSpeakingRef.current = false;
        // Reseta o deduplicador para aceitar qualquer novo comando
        lastResultRef.current = { text: '', time: 0 };
      }, 500);
    };

    utterance.onend   = onTerminou;
    utterance.onerror = onTerminou;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  return {
    isListening, interimTranscript, finalTranscript, error,
    isSupported, start, stop, toggle, speak
  };
}