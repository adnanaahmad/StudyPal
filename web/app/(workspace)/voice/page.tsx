"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Mic, MicOff, PhoneOff, Play, Bot, Loader2, Signal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { VocalBridgeProvider, useVocalBridge, useTranscript } from "@vocalbridgeai/react";
import { ConnectionState } from "@vocalbridgeai/sdk";
import { apiUrl } from "@/lib/api";

/* ── Main Component ── */

export default function VoicePage() {
  const [isStarted, setIsStarted] = useState(false);
  const searchParams = useSearchParams();
  const botId = searchParams.get("bot_id");

  return (
    <AnimatePresence mode="wait">
      {!isStarted ? (
        <motion.div
          key="start"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="h-full w-full"
        >
          <VoiceStart onStart={() => setIsStarted(true)} botId={botId} />
        </motion.div>
      ) : (
        <motion.div
          key="session"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="h-full w-full"
        >
          <VoicePageInner botId={botId} onEnd={() => setIsStarted(false)} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Start Screen ── */

function VoiceStart({ onStart, botId }: { onStart: () => void; botId: string | null }) {
  const router = useRouter();
  const [botInfo, setBotInfo] = useState<{ name: string; description: string } | null>(null);
  const [loading, setLoading] = useState(!!botId);

  useEffect(() => {
    if (!botId) return;
    async function fetchBot() {
      try {
        const res = await fetch(apiUrl(`/api/v1/tutorbot/${botId}`));
        if (res.ok) {
          const data = await res.json();
          setBotInfo({ name: data.name, description: data.description });
        }
      } catch (err) {
        console.error("Failed to fetch bot info", err);
      } finally {
        setLoading(false);
      }
    }
    void fetchBot();
  }, [botId]);

  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-30">
        <div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -bottom-1/4 -right-1/4 h-[600px] w-[600px] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      {/* Back Button */}
      <div className="absolute left-6 top-6 z-10">
        <button
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--muted)]/50 text-[var(--muted-foreground)] backdrop-blur-md transition-all hover:bg-[var(--muted)] hover:text-[var(--foreground)] active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-md px-6 text-center">
        {/* Visual Header */}
        <div className="mb-12 relative">
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute inset-0 -m-8 rounded-full bg-primary/20 blur-2xl"
          />
          <div className="relative flex h-32 w-32 items-center justify-center rounded-full border border-white/20 bg-[var(--card)] shadow-2xl backdrop-blur-xl">
             {loading ? (
               <Loader2 className="h-12 w-12 text-primary animate-spin" />
             ) : (
               <Mic className="h-12 w-12 text-primary" />
             )}
          </div>
          <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
            <Signal className="h-4 w-4" />
          </div>
        </div>

        {/* Content */}
        <h1 className="mb-3 text-[24px] font-semibold tracking-tight text-[var(--foreground)]">
          {loading ? "Preparing..." : botInfo ? botInfo.name : "Voice Assistant"}
        </h1>
        <p className="mb-10 text-[var(--muted-foreground)] leading-relaxed">
          {botInfo?.description || "Experience a natural, real-time conversation with your AI tutor. Speak freely and learn naturally."}
        </p>

        {/* Start Button */}
        <button
          onClick={onStart}
          disabled={loading}
          className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-primary py-4 px-8 text-lg font-semibold text-white shadow-xl transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
        >
          <Play className="h-5 w-5 fill-white transition-transform group-hover:scale-110" />
          Start Session
        </button>
        
        <p className="mt-6 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)] opacity-50">
          Powered by VocalBridge Real-time API
        </p>
      </div>
    </div>
  );
}

/* ── Provider wrapper ── */

function VoicePageInner({ botId, onEnd }: { botId: string | null; onEnd: () => void }) {
  const tokenUrl = useMemo(
    () => {
      const url = new URL(apiUrl("/api/v1/voice/token"), window.location.origin);
      if (botId) url.searchParams.set("bot_id", botId);
      return url.toString();
    },
    [botId]
  );

  const options = useMemo(() => ({
    auth: { tokenUrl },
    participantName: "User"
  }), [tokenUrl]);

  return (
    <VocalBridgeProvider options={options}>
      <VoiceSession botId={botId} onEnd={onEnd} />
    </VocalBridgeProvider>
  );
}

/* ── Session inner component ── */

function VoiceSession({ botId, onEnd }: { botId: string | null; onEnd: () => void }) {
  const { state, connect, disconnect, toggleMicrophone, isMicrophoneEnabled, error } =
    useVocalBridge();
  const { transcript } = useTranscript();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const connectingRef = useRef(false);

  // Connection logging
  useEffect(() => {
    console.log("[VocalBridge] State:", state);
    if (error) console.error("[VocalBridge] Error:", error);
  }, [state, error]);

  // Connect on mount
  useEffect(() => {
    let active = true;
    
    if (connectingRef.current || state !== ConnectionState.Disconnected) return;
    connectingRef.current = true;

    async function init() {
      try {
        console.log("[VocalBridge] Auto-connecting...");
        await connect();
      } catch (e) {
        if (active) console.error("VocalBridge auto-connect failed:", e);
      }
    }

    void init();

    return () => {
      active = false;
      connectingRef.current = false;
    };
  }, [connect, state]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleEnd = async () => {
    console.log("[VocalBridge] Ending call...");
    await disconnect();
    onEnd();
  };

  const latestEntry = transcript[transcript.length - 1];
  const agentSpeaking =
    state === ConnectionState.Connected &&
    latestEntry?.role === "agent" &&
    !!latestEntry.text;

  const isDisconnected = state === ConnectionState.Disconnected;
  const isPending = state === ConnectionState.Connecting || state === ConnectionState.WaitingForAgent;

  return (
    <div className="relative flex h-screen w-full flex-col items-center overflow-hidden bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--primary)]/20">
      {/* Background Glow */}
      <div className="absolute inset-0 z-0 opacity-20 dark:opacity-30">
        <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-radial from-primary/30 to-transparent blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex w-full items-center justify-between p-6">
        <button
          onClick={handleEnd}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--muted)]/50 text-[var(--muted-foreground)] backdrop-blur-md transition-all hover:bg-[var(--muted)] hover:text-[var(--foreground)] active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
            {botId ? botId.toUpperCase() : "VOICE AGENT"}
          </h1>
          <div className="flex items-center gap-1.5">
            <div className={`h-1.5 w-1.5 rounded-full ${state === ConnectionState.Connected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-[var(--muted-foreground)]"}`} />
            <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
              {state.toLowerCase().replace("_", " ")}
            </span>
          </div>
        </div>
        <div className="w-10" /> {/* Spacer */}
      </div>

      {/* Main Content: Orb Area */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center py-12">
        <div className="relative flex items-center justify-center">
          {/* Outer Pulse Rings (Connected & Speaking) */}
          <AnimatePresence>
            {state === ConnectionState.Connected && (
              <>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ 
                    scale: agentSpeaking ? [0.8, 2.5] : [0.8, 1.8], 
                    opacity: agentSpeaking ? [0.5, 0] : [0.3, 0] 
                  }}
                  transition={{ 
                    duration: agentSpeaking ? 1.5 : 3, 
                    repeat: Infinity, 
                    ease: "easeOut" 
                  }}
                  className="absolute h-32 w-32 rounded-full border-2 border-primary/30"
                />
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ 
                    scale: agentSpeaking ? [0.8, 2] : [0.8, 1.5], 
                    opacity: agentSpeaking ? [0.4, 0] : [0.2, 0] 
                  }}
                  transition={{ 
                    duration: agentSpeaking ? 1.5 : 3, 
                    repeat: Infinity, 
                    ease: "easeOut", 
                    delay: agentSpeaking ? 0.4 : 1 
                  }}
                  className="absolute h-32 w-32 rounded-full border-2 border-primary/20"
                />
              </>
            )}
          </AnimatePresence>

          {/* Core Orb */}
          <motion.div
            animate={{
              scale: agentSpeaking ? [1, 1.08, 1] : (state === ConnectionState.Connected ? [1, 1.02, 1] : 1),
              boxShadow: agentSpeaking
                ? [
                    "0 0 30px oklch(54.6% 0.245 262.881 / 40%)",
                    "0 0 60px oklch(54.6% 0.245 262.881 / 60%)",
                    "0 0 30px oklch(54.6% 0.245 262.881 / 40%)",
                  ]
                : (state === ConnectionState.Connected)
                ? [
                    "0 4px 20px oklch(54.6% 0.245 262.881 / 10%)",
                    "0 4px 40px oklch(54.6% 0.245 262.881 / 25%)",
                    "0 4px 20px oklch(54.6% 0.245 262.881 / 10%)",
                  ]
                : isPending
                ? "0 0 20px rgba(139, 133, 128, 0.2)"
                : "0 4px 12px rgba(0, 0, 0, 0.1)",
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className={`relative flex h-40 w-40 items-center justify-center rounded-full border-4 border-white/20 bg-slate-50/90 p-1 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80 ${
              isDisconnected ? "grayscale saturate-0 opacity-40" : ""
            }`}
          >
            {/* Gloss Highlight */}
            <div className="absolute inset-0 rounded-full bg-linear-to-tr from-white to-transparent opacity-30" />
            
            {/* Status Icon */}
            <AnimatePresence mode="wait">
              {isDisconnected ? (
                <motion.div
                  key="play"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <Play className="h-12 w-12 text-primary fill-primary" />
                </motion.div>
              ) : isPending ? (
                <motion.div
                  key="loading"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary"
                />
              ) : !isMicrophoneEnabled ? (
                <motion.div
                  key="muted"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center"
                >
                  <MicOff className="h-10 w-10 text-primary/80" />
                </motion.div>
              ) : agentSpeaking ? (
                <motion.div
                  key="speaking"
                  className="flex items-center gap-1"
                >
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ height: [8, 24, 8] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                      className="w-1.5 rounded-full bg-primary"
                    />
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="connected"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Mic className="h-10 w-10 text-primary" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* State Indicators */}
        <div className="mt-8 flex flex-col items-center gap-2">
          <AnimatePresence mode="wait">
            <motion.span
              key={state}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="text-lg font-medium tracking-tight"
            >
              {agentSpeaking ? "Speaking…" : isDisconnected ? "Get Started" : "Listening…"}
            </motion.span>
          </AnimatePresence>
          {error && (
            <span className="text-xs text-red-500 font-medium">{error.message}</span>
          )}
        </div>
      </div>

      {/* Transcript Area */}
      <div className="relative z-10 w-full bg-linear-to-t from-[var(--background)] to-transparent px-6 pb-32 transition-all duration-500">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 overflow-y-auto hide-scrollbar max-h-[32vh]">
          <AnimatePresence initial={false}>
            {transcript.map((entry, i) => (
              <motion.div
                key={`${i}-${entry.text.substring(0, 10)}`}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex w-full ${entry.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm backdrop-blur-md transition-all sm:max-w-[70%] ${
                    entry.role === "user"
                      ? "bg-primary text-white shadow-primary/20"
                      : "bg-[var(--muted)]/80 text-[var(--foreground)] ring-1 ring-inset ring-white/10"
                  }`}
                >
                  {entry.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* Control Bar */}
      <div className="absolute bottom-8 left-1/2 z-20 w-fit -translate-x-1/2">
        <motion.div 
          className="flex items-center gap-2 rounded-full bg-[var(--card)] p-2 shadow-2xl ring-1 ring-[var(--border)]/50 backdrop-blur-xl dark:bg-[var(--card)]/90"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {isDisconnected ? (
            <button
               onClick={connect}
               className="flex items-center gap-2 rounded-full bg-primary px-8 py-3 font-semibold text-white transition-all hover:brightness-110 active:scale-95 shadow-lg shadow-primary/20"
            >
              <Play className="h-4 w-4 fill-white" />
              Reconnect
            </button>
          ) : (
            <>
              <button
                onClick={() => void toggleMicrophone()}
                disabled={isPending}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition-all active:scale-90 ${
                  isMicrophoneEnabled 
                    ? "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--muted)]/80" 
                    : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                }`}
                title={isMicrophoneEnabled ? "Mute" : "Unmute"}
              >
                {isMicrophoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>
              
              <div className="h-8 w-px bg-[var(--border)] mx-1" />

              <button
                onClick={handleEnd}
                className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 font-semibold text-white transition-all hover:bg-red-600 active:scale-95 shadow-lg shadow-red-500/20"
              >
                <PhoneOff className="h-4 w-4" />
                End Call
              </button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
