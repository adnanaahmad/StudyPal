# Speech-to-Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mic button to the chat composer that transcribes speech into the input textarea using the browser's Web Speech API.

**Architecture:** A `useSpeechToText` hook owns all recognition logic and exposes a stable interface so the implementation can be swapped to Whisper.js later without touching any component. The parent page (`web/app/(workspace)/page.tsx`) calls the hook and passes state/callbacks down to `ChatComposer`, which renders the mic button in its existing bottom toolbar.

**Tech Stack:** Web Speech API (browser-native), React hooks, TypeScript, Lucide icons, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `web/hooks/useSpeechToText.ts` | All speech recognition logic and state |
| Modify | `web/components/chat/home/ChatComposer.tsx` | Add mic button + error message UI |
| Modify | `web/app/(workspace)/page.tsx` | Call hook, wire callbacks, pass props |

---

### Task 1: Create `useSpeechToText` hook

**Files:**
- Create: `web/hooks/useSpeechToText.ts`

- [ ] **Step 1: Create the hook file**

```ts
// web/hooks/useSpeechToText.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseSpeechToTextOptions {
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

// Extend window type for webkit prefix
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
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
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognitionAPI);
  }, []);

  const start = useCallback(() => {
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
      setIsRecording(false);
      if (event.error === "not-allowed") {
        onErrorRef.current("Microphone access denied");
      }
      // Other errors (network, aborted) are silently ignored
    };

    recognition.onend = () => {
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

  return { isRecording, isSupported, start, stop };
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `useSpeechToText.ts`. (Other pre-existing errors in the project are fine.)

- [ ] **Step 3: Commit**

```bash
git add web/hooks/useSpeechToText.ts
git commit -m "feat: add useSpeechToText hook with Web Speech API"
```

---

### Task 2: Add mic button to `ChatComposer`

**Files:**
- Modify: `web/components/chat/home/ChatComposer.tsx`

- [ ] **Step 1: Add new props to the props interface**

In `ChatComposer.tsx`, find the props destructure parameter block (line ~132, starting with `composerRef: RefObject<HTMLDivElement | null>;`). Add these four new entries to the interface:

```ts
  isRecording: boolean;
  isSpeechSupported: boolean;
  speechError: string | null;
  onMicClick: () => void;
```

And add them to the destructured parameter list:

```ts
  isRecording,
  isSpeechSupported,
  speechError,
  onMicClick,
```

- [ ] **Step 2: Add `Mic` to the lucide import**

Find this line near the top of the file:

```ts
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  FilePlus2,
  Loader2,
  MessageSquare,
  Paperclip,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
```

Replace with:

```ts
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  FilePlus2,
  Loader2,
  MessageSquare,
  Mic,
  Paperclip,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
```

- [ ] **Step 3: Add the mic button to the toolbar**

Find the `ml-auto` div that wraps the KB select and send button (line ~425):

```tsx
<div className="ml-auto flex shrink-0 items-center gap-1.5">
```

Add the mic button as the first child of that div, before the `<select>`:

```tsx
<div className="ml-auto flex shrink-0 items-center gap-1.5">
  <button
    onClick={onMicClick}
    disabled={!isSpeechSupported || isStreaming}
    title={!isSpeechSupported ? "Voice input not supported in this browser" : isRecording ? "Stop recording" : "Start voice input"}
    className={`rounded-full p-[7px] transition-colors disabled:opacity-25 ${
      isRecording
        ? "bg-[var(--primary)]/10 text-[var(--primary)] animate-pulse"
        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/50"
    }`}
    aria-label={isRecording ? "Stop recording" : "Start voice input"}
  >
    <Mic size={15} strokeWidth={2} />
  </button>
  {/* existing select and send button follow */}
```

- [ ] **Step 4: Add the error message below the composer box**

Find the closing `</div>` of the outer `<div className="relative">` wrapper (just before the final `</div>` of the return). Add the error message after the main card div:

```tsx
      </div>{/* end main card div */}
      {speechError && (
        <p className="mt-1.5 px-1 text-[12px] text-red-500">{speechError}</p>
      )}
    </div>  {/* end relative wrapper */}
```

- [ ] **Step 5: Verify the file compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add web/components/chat/home/ChatComposer.tsx
git commit -m "feat: add mic button and speech error UI to ChatComposer"
```

---

### Task 3: Wire up the hook in the parent page

**Files:**
- Modify: `web/app/(workspace)/page.tsx`

- [ ] **Step 1: Add speech state and import the hook**

At the top of `web/app/(workspace)/page.tsx`, add the import after the existing hook imports:

```ts
import { useSpeechToText } from "@/hooks/useSpeechToText";
```

- [ ] **Step 2: Add `speechError` state and interim ref**

Inside `HomePage`, after the existing `useState` declarations (around line 222), add:

```ts
const [speechError, setSpeechError] = useState<string | null>(null);
const interimLengthRef = useRef(0);
```

- [ ] **Step 3: Define speech callbacks**

Add these callback handlers inside `HomePage`, before the `return`:

```ts
const handleSpeechInterim = useCallback((text: string) => {
  setInput((prev) => {
    // Replace the previous interim chunk (tracked by length) with new interim
    const base = prev.slice(0, prev.length - interimLengthRef.current);
    interimLengthRef.current = text.length;
    return base + text;
  });
}, []);

const handleSpeechFinal = useCallback((text: string) => {
  setInput((prev) => {
    // Remove any interim chunk first, then append final
    const base = prev.slice(0, prev.length - interimLengthRef.current);
    interimLengthRef.current = 0;
    const trimmed = base.trimEnd();
    return trimmed ? trimmed + " " + text : text;
  });
}, []);

const handleSpeechError = useCallback((message: string) => {
  setSpeechError(message);
  setTimeout(() => setSpeechError(null), 4000);
}, []);
```

- [ ] **Step 4: Call the hook**

Add this after the callback definitions:

```ts
const { isRecording, isSupported: isSpeechSupported, start: startRecording, stop: stopRecording } =
  useSpeechToText({
    onInterim: handleSpeechInterim,
    onFinal: handleSpeechFinal,
    onError: handleSpeechError,
  });

const handleMicClick = useCallback(() => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}, [isRecording, startRecording, stopRecording]);
```

- [ ] **Step 5: Pass new props to `ChatComposer`**

Find the `<ChatComposer` JSX in the return (search for `isStreaming={state.isStreaming}`). Add the four new props:

```tsx
isRecording={isRecording}
isSpeechSupported={isSpeechSupported}
speechError={speechError}
onMicClick={handleMicClick}
```

- [ ] **Step 6: Verify the file compiles**

```bash
cd web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add web/app/(workspace)/page.tsx
git commit -m "feat: wire useSpeechToText into chat page"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
cd web && npm run dev
```

- [ ] **Step 2: Test in Chrome**

Open `http://localhost:3000`. Click the mic button. Grant microphone permission. Speak a sentence. Verify:
- Interim text appears in the textarea as you speak
- Final text is appended cleanly when you stop
- Mic button pulses while recording and returns to idle after

- [ ] **Step 3: Test appending to existing text**

Type "Hello" in the textarea. Click mic. Speak "world". Verify the result is "Hello world" (with a space), not "world" alone.

- [ ] **Step 4: Test stopping early**

Click mic to start, then click again immediately. Verify recording stops.

- [ ] **Step 5: Test Firefox**

Open in Firefox. Verify the mic button is greyed out (disabled) and shows tooltip "Voice input not supported in this browser".

- [ ] **Step 6: Test mic permission denied**

In Chrome, block microphone permission for the site (Site Settings → Microphone → Block). Click mic. Verify "Microphone access denied" appears below the composer and disappears after ~4 seconds.

- [ ] **Step 7: Final commit if any small fixes were made**

```bash
git add -p
git commit -m "fix: speech-to-text manual testing fixes"
```
