# Speech-to-Text for Chat Input

**Date:** 2026-04-17  
**Status:** Approved

## Overview

Add a mic button to the chat composer that lets users dictate their message using the browser's Web Speech API. The speech logic is encapsulated in a custom hook (`useSpeechToText`) so that swapping to Whisper.js in the future is a one-file change.

## Approach

Web Speech API (browser-native), frontend-only. No backend changes. No new dependencies.

The hook interface is defined abstractly so the implementation can be replaced with Whisper.js later without touching any component code.

## Architecture

### `web/hooks/useSpeechToText.ts`

Custom hook that owns all speech recognition logic and state.

**Returns:**
```ts
{
  isRecording: boolean;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
}
```

**Internals:**
- Checks `window.SpeechRecognition || window.webkitSpeechRecognition` on mount to set `isSupported`
- `continuous: false`, `interimResults: true`
- Calls provided `onInterim(text: string)` and `onFinal(text: string)` callbacks
- On `onend`, sets `isRecording: false` automatically
- Handles `NotAllowedError` and other errors via an `onError(error: string)` callback

### `web/components/chat/home/ChatComposer.tsx`

Receives two new props:
- `isRecording: boolean`
- `onMicClick: () => void`
- `isSpeechSupported: boolean`
- `speechError: string | null`

Mic button added to the bottom toolbar, left of the send button. Button is disabled when `isStreaming` or `!isSpeechSupported`.

A brief error message renders below the composer when `speechError` is set (clears after 4 seconds).

### Parent page (chat page-client)

- Calls `useSpeechToText` with `onInterim`, `onFinal`, `onError` callbacks
- `onInterim`: replaces the trailing interim chunk in `input` state
- `onFinal`: appends to existing `input` with a space if input is non-empty
- `onError`: sets `speechError` state (auto-clears after 4s)
- Passes `isRecording`, `onMicClick`, `isSpeechSupported`, `speechError` down to `ChatComposer`

## UI States

| State | Mic button appearance |
|---|---|
| Idle, supported | Mic icon, muted color |
| Recording | Mic icon, primary color + pulse animation |
| Unsupported (Firefox) | Mic icon, disabled, tooltip: "Voice input not supported in this browser" |
| Streaming (AI responding) | Mic icon, disabled |

## Data Flow

1. User clicks mic → `start()` → `SpeechRecognition` begins
2. Interim results → `onInterim(text)` → replaces interim chunk in textarea
3. Final result → `onFinal(text)` → appended to existing input
4. Browser fires `onend` on silence → `isRecording` → false automatically
5. User can click mic again to stop early → `stop()` called

## Error Handling

- `NotAllowedError` → `onError("Microphone access denied")`
- No `SpeechRecognition` in window → `isSupported: false`, mic button disabled
- Network/other errors → silently stop recording (treat as `onend`)
- Recording blocked when `isStreaming: true`

## Testing

No automated tests (Web Speech API not mockable in jsdom without significant effort — deferred for MVP).

Manual test checklist:
- [ ] Record in Chrome — transcription appears in textarea
- [ ] Record in Safari — transcription appears in textarea  
- [ ] Open in Firefox — mic button is disabled with tooltip
- [ ] Existing text in input + record → speech appends with space, does not overwrite
- [ ] Click mic to stop early — recording stops
- [ ] Deny mic permission — error message appears below composer
- [ ] Send button disabled during recording — no accidental sends

## Future: Whisper.js Upgrade Path

To upgrade to Whisper.js (`@huggingface/transformers`):
1. Replace the `SpeechRecognition` implementation inside `useSpeechToText.ts` with Whisper.js
2. Add model download progress state to the hook return value
3. No changes needed in `ChatComposer` or the parent page
