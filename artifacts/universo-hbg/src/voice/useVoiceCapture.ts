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
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
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
        if (transcript) onResultRef.current(transcript);
      };
      recognition.onerror = (event) => {
        setListening(false);
        setError(mapError(event.error));
      };
      recognition.onend = () => {
        setListening(false);
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
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
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

  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (recognition) {
        try {
          recognition.stop();
        } catch {
          /* already stopped */
        }
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
      }
    };
  }, []);

  return { supported, listening, error, start, stop };
}