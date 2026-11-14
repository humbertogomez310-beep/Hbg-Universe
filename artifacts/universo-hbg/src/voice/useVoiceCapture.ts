import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionAlternativeList {
  [index: number]: SpeechRecognitionResultLike;
  length: number;
}
interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionAlternativeList;
  length: number;
}
interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface UseVoiceCaptureResult {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function mapError(code: string): string {
  if (code === "not-allowed" || code === "permission-denied") return "Permiso de micrófono denegado.";
  if (code === "no-speech") return "No se detectó ninguna voz.";
  if (code === "audio-capture") return "No se encontró micrófono.";
  return "Ocurrió un error con el reconocimiento de voz.";
}

export function useVoiceCapture(onResult: (text: string) => void, lang = "es-ES"): UseVoiceCaptureResult {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onResultRef = useRef(onResult);
  const captureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discardResultRef = useRef(false);
  onResultRef.current = onResult;

  const Ctor = getSpeechRecognitionCtor();
  const supported = Ctor !== null;

  const getRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (!Ctor) return null;
    if (!recognitionRef.current) {
      const recognition = new Ctor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = lang;
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? "";
        setListening(false);
        if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
        if (transcript && !discardResultRef.current) onResultRef.current(transcript);
      };
      recognition.onerror = (event) => {
        setListening(false);
        if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
        if (!discardResultRef.current) setError(mapError(event.error));
      };
      recognition.onend = () => {
        setListening(false);
        if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
      };
      recognition.onstart = () => {
        captureTimeoutRef.current = setTimeout(() => {
          discardResultRef.current = true;
          setError("Se agotó el tiempo de captura de voz.");
          try {
            recognition.abort();
          } catch {
            setListening(false);
          }
        }, 15000);
      };
      recognitionRef.current = recognition;
    }
    return recognitionRef.current;
  }, [Ctor, lang]);

  const start = useCallback(() => {
    if (!supported) {
      setError("Tu navegador no soporta reconocimiento de voz.");
      return;
    }
    const recognition = getRecognition();
    if (!recognition) return;
    discardResultRef.current = false;
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
      setListening(false);
      setError("No se pudo iniciar el reconocimiento de voz.");
    }
  }, [supported, getRecognition]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const cancel = useCallback(() => {
    if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
    discardResultRef.current = true;
    const recognition = recognitionRef.current;
    if (!recognition) {
      setListening(false);
      return;
    }
    try {
      recognition.abort();
      setListening(false);
    } catch {
      setListening(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.abort();
        } catch {
          /* already stopped */
        }
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
      }
    };
  }, []);

  return { supported, listening, error, start, stop, cancel };
}