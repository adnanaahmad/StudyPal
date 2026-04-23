"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, RotateCcw, RotateCw, Settings2, SkipBack, SkipForward, Volume2 } from "lucide-react";
import Image from "next/image";
import { apiUrl } from "@/lib/api";

interface ScriptLine {
  speaker: string;
  text: string;
  timestamp?: number; // Exact start time calculated by backend
  end_time?: number;  // Exact end time calculated by backend
}

interface Podcast {
  id: string;
  title: string;
  duration: number;
  audio_url: string;
  script: ScriptLine[];
}

export function PodcastPlayer({ podcast, onBack }: { podcast: Podcast, onBack: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / (audio.duration || 1)) * 100);
      
      // Determine active speaker
      if (podcast.script.length > 0) {
        const timePerLine = (audio.duration || 1) / Math.max(podcast.script.length, 1);
        const activeLine = podcast.script.find((l, idx) => {
          const start = l.timestamp !== undefined ? l.timestamp : idx * timePerLine;
          const end = l.end_time !== undefined ? l.end_time : (idx + 1) * timePerLine;
          return audio.currentTime >= start && audio.currentTime < end;
        });
        
        if (activeLine) {
          setActiveSpeaker(activeLine.speaker);
        } else if (audio.currentTime >= audio.duration) {
          setActiveSpeaker(null);
        }
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setActiveSpeaker(null);
      setProgress(0);
      setCurrentTime(0);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [podcast.script, podcast.duration]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      void audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const skip = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime += seconds;
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-full flex-col max-w-4xl mx-auto p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-2">
            ← Back to Library
          </button>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">{podcast.title}</h1>
          <p className="text-[var(--muted-foreground)] mt-1">Audio Overview • {formatTime(podcast.duration)}</p>
        </div>
      </div>

      {/* Player Card */}
      <div className="relative rounded-2xl border border-[var(--border)] bg-[#0A0D14] overflow-hidden shadow-2xl p-8">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10 opacity-50" />
        
        <div className="relative flex flex-col h-full">
          {/* Avatars & Soundwave */}
          <div className="flex items-center justify-between px-8 mb-12">
            {/* Host A */}
            <div className={`flex flex-col items-center transition-all duration-300 ${activeSpeaker === "Sarah" && isPlaying ? "scale-110" : "scale-100 opacity-60"}`}>
              <div className={`relative h-24 w-24 rounded-full p-1 ${activeSpeaker === "Sarah" && isPlaying ? "bg-gradient-to-br from-cyan-400 to-blue-600" : "bg-[var(--border)]"}`}>
                <div className="h-full w-full rounded-full bg-[var(--background)] overflow-hidden border-2 border-[#0A0D14]">
                  {/* Avatar Image Placeholder */}
                  <div className="w-full h-full bg-blue-900/40 flex items-center justify-center text-2xl font-bold text-blue-200">S</div>
                </div>
              </div>
              <span className="mt-4 font-semibold text-[var(--foreground)]">Sarah</span>
            </div>

            {/* Soundwave */}
            <div className="flex-1 flex justify-center items-center h-20 px-12 gap-1.5">
              {Array.from({ length: 32 }).map((_, i) => {
                const isActive = isPlaying;
                return (
                  <motion.div
                    key={i}
                    className={`w-1.5 rounded-full ${activeSpeaker === "Sarah" && isActive ? "bg-cyan-400" : activeSpeaker === "Alex" && isActive ? "bg-purple-500" : "bg-gray-600"}`}
                    animate={{
                      height: isActive ? ["20%", `${Math.random() * 80 + 20}%`, "20%"] : "20%",
                    }}
                    transition={{
                      duration: 0.8 + Math.random() * 0.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                )
              })}
            </div>

            {/* Host B */}
            <div className={`flex flex-col items-center transition-all duration-300 ${activeSpeaker === "Alex" && isPlaying ? "scale-110" : "scale-100 opacity-60"}`}>
              <div className={`relative h-24 w-24 rounded-full p-1 ${activeSpeaker === "Alex" && isPlaying ? "bg-gradient-to-br from-purple-500 to-pink-600" : "bg-[var(--border)]"}`}>
                <div className="h-full w-full rounded-full bg-[var(--background)] overflow-hidden border-2 border-[#0A0D14]">
                  {/* Avatar Image Placeholder */}
                  <div className="w-full h-full bg-purple-900/40 flex items-center justify-center text-2xl font-bold text-purple-200">A</div>
                </div>
              </div>
              <span className="mt-4 font-semibold text-[var(--foreground)]">Alex</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col space-y-6">
            {/* Scrubber */}
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-[var(--muted-foreground)] w-10 text-right">{formatTime(currentTime)}</span>
              <div className="relative h-1.5 flex-1 rounded-full bg-[var(--secondary)] overflow-hidden cursor-pointer"
                onClick={(e) => {
                  if (!audioRef.current) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  audioRef.current.currentTime = pct * (audioRef.current.duration || 1);
                }}
              >
                <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs font-medium text-[var(--muted-foreground)] w-10">{formatTime(podcast.duration)}</span>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-center gap-8">
              <button onClick={() => skip(-15)} className="text-[var(--muted-foreground)] hover:text-white transition">
                <RotateCcw size={24} />
              </button>
              <button onClick={togglePlay} className="h-14 w-14 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 hover:scale-105 transition-transform">
                {isPlaying ? <Pause size={28} className="fill-current" /> : <Play size={28} className="fill-current ml-1" />}
              </button>
              <button onClick={() => skip(30)} className="text-[var(--muted-foreground)] hover:text-white transition">
                <RotateCw size={24} />
              </button>
            </div>
          </div>
        </div>
        
        {/* Hidden Audio Element */}
        <audio ref={audioRef} src={apiUrl(podcast.audio_url)} preload="metadata" />
      </div>

      {/* Transcript */}
      <div className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 overflow-y-auto">
        <h3 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mb-6 flex items-center gap-2">
          <Settings2 size={16} />
          Interactive Transcript
        </h3>
        <div className="space-y-4">
          {podcast.script.map((line, idx) => {
            const timePerLine = podcast.duration / Math.max(podcast.script.length, 1);
            const lineStart = line.timestamp !== undefined ? line.timestamp : idx * timePerLine;
            const lineEnd = line.end_time !== undefined ? line.end_time : (idx + 1) * timePerLine;
            const isLineActive = currentTime >= lineStart && currentTime < lineEnd;
            
            return (
              <div 
                key={idx} 
                className={`p-4 rounded-xl transition-all duration-300 cursor-pointer ${
                  isLineActive 
                    ? "bg-[var(--secondary)] border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]" 
                    : "hover:bg-[var(--secondary)]/50 border border-transparent"
                }`}
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = lineStart;
                    if (!isPlaying) togglePlay();
                  }
                }}
              >
                <div className="flex items-baseline gap-3 mb-1">
                  <span className={`text-xs font-bold uppercase tracking-wider ${line.speaker === "Sarah" ? "text-cyan-400" : "text-purple-400"}`}>
                    {line.speaker}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">{formatTime(lineStart)}</span>
                </div>
                <p className={`text-[15px] leading-relaxed ${isLineActive ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}>
                  {line.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
