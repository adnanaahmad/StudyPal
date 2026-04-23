"use client";

import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }

  interface SpeechRecognitionConstructor {
    new (): SpeechRecognition;
    prototype: SpeechRecognition;
  }

  interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList;
    readonly resultIndex: number;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string | any;
  }

  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionResult {
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
    readonly isFinal: boolean;
  }

  interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
    onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
    onend: ((this: SpeechRecognition, ev: Event) => any) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }
}

export interface UseSpeechToTextOptions {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
}

export interface UseSpeechToTextReturn {
  isRecording: boolean;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
}

export function useSpeechToText({
  onInterim,
  onFinal,
  onError,
}: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);

  // Keep refs up to date so recognition handlers always call latest callbacks
  useEffect(() => {
    onInterimRef.current = onInterim;
  }, [onInterim]);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognitionAPI);
  }, []);

  const start = useCallback(() => {
    if (recognitionRef.current) return; // already running

    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (interim) onInterimRef.current(interim);
      if (final) onFinalRef.current(final);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      recognitionRef.current = null;
      setIsRecording(false);
      if (event.error === "not-allowed") {
        onErrorRef.current("Microphone access denied");
      }
      // Other errors (network, aborted) are silently ignored
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { isRecording, isSupported, start, stop };
}
