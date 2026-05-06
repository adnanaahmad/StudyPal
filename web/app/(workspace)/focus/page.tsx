"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Brain, 
  Music, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  Circle, 
  Plus, 
  Trash2, 
  Wind,
  CloudRain,
  Trees,
  Music2,
  Timer as TimerIcon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

/* ── Types & Constants ── */

type TimerMode = "focus" | "shortBreak" | "longBreak";

const MODES: Record<TimerMode, { label: string; duration: number; color: string; bg: string }> = {
  focus: { 
    label: "Focus", 
    duration: 25 * 60, 
    color: "#fd8a8a", 
    bg: "transparent"
  },
  shortBreak: { 
    label: "Short Break", 
    duration: 5 * 60, 
    color: "oklch(65% 0.1 180)", // Subtle teal
    bg: "transparent"
  },
  longBreak: { 
    label: "Long Break", 
    duration: 15 * 60, 
    color: "oklch(65% 0.1 260)", // Subtle blue/indigo
    bg: "transparent"
  }
};

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

interface Sound {
  id: string;
  name: string;
  url: string;
  icon: any;
}

const SOUNDS: Sound[] = [
  { id: "lofi", name: "Lofi Study", url: "/sounds/lofi.mp3", icon: Music2 },
  { id: "rain", name: "Rain", url: "/sounds/rain.mp3", icon: CloudRain },
  { id: "forest", name: "Forest", url: "/sounds/birds.mp3", icon: Trees },
  { id: "white-noise", name: "White Noise", url: "/sounds/white-noise.mp3", icon: Wind }
];

/* ── Main Component ── */

export default function FocusPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<TimerMode>("focus");
  const [timeLeft, setTimeLeft] = useState(MODES.focus.duration);
  const [isActive, setIsActive] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [currentSound, setCurrentSound] = useState<Sound | null>(null);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("25");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /* ── Timer Logic ── */

  const switchMode = useCallback((newMode: TimerMode) => {
    setMode(newMode);
    setTimeLeft(MODES[newMode].duration);
    setIsActive(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsActive(false);
      handleTimerComplete();
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, timeLeft]);

  const handleTimerComplete = () => {
    const audio = new Audio("https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3");
    audio.play();

    if (mode === "focus") {
      setPomodorosCompleted((prev) => prev + 1);
      if ((pomodorosCompleted + 1) % 4 === 0) {
        switchMode("longBreak");
      } else {
        switchMode("shortBreak");
      }
    } else {
      switchMode("focus");
    }
  };

  const toggleTimer = () => {
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(MODES[mode].duration);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleEditSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const mins = parseInt(editValue, 10);
    if (!isNaN(mins) && mins > 0 && mins <= 480) {
      setTimeLeft(mins * 60);
      setIsEditing(false);
    } else {
      setEditValue(Math.floor(timeLeft / 60).toString());
      setIsEditing(false);
    }
  };

  /* ── Sound Logic ── */

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentSound && !isMuted) {
      if (audio.src !== currentSound.url) {
        audio.src = currentSound.url;
        audio.load();
      }
      
      audio.loop = true;
      audio.volume = volume;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.error("[FocusApp] Audio playback failed:", err);
        });
      }
    } else {
      audio.pause();
    }
  }, [currentSound, isMuted, volume]);

  /* ── Task Logic ── */

  const addTask = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTaskText.trim()) return;
    const newTask: Task = {
      id: crypto.randomUUID(),
      text: newTaskText,
      completed: false,
    };
    setTasks([...tasks, newTask]);
    setNewTaskText("");
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-slate-950 animate-fade-in relative selection:bg-primary/20">
      {/* Background stays clean as per request */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-[0.03] pointer-events-none">
        <motion.div 
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 right-0 w-full h-full bg-radial from-slate-500 to-transparent blur-3xl" 
        />
      </div>

      {/* Header Section */}
      <div className="relative z-20 flex items-center justify-between px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-slate-600 dark:text-slate-400">
            <TimerIcon size={14} strokeWidth={2.5} />
            <span className="text-[11px] font-bold uppercase tracking-wider">{t("Workshop")}</span>
          </div>
          <h1 className="font-serif text-2xl font-medium tracking-tight text-[var(--foreground)]">
            {t("Focus Mode")}
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-2xl bg-[var(--card)] border border-[var(--border)] px-4 py-2 shadow-sm">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <span className="text-xs font-bold tabular-nums text-[var(--foreground)]">#{pomodorosCompleted} Sessions</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col lg:flex-row gap-8 px-8 pb-8 overflow-hidden">
        
        {/* Main Timer Column */}
        <div className="flex-1 flex flex-col items-center justify-center relative min-h-0">
          
          {/* Mode Tabs */}
          <div className="flex gap-1.5 p-1.5 rounded-2xl bg-[var(--card)] border border-[var(--border)] mb-8 shadow-sm">
            {(Object.keys(MODES) as TimerMode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all duration-300 ${
                  mode === m 
                    ? "bg-[var(--foreground)] text-[var(--background)] shadow-md" 
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)]"
                }`}
              >
                {MODES[m].label}
              </button>
            ))}
          </div>

          {/* Timer Display */}
          <div className="relative flex flex-col items-center justify-center">
             {isEditing ? (
               <form onSubmit={handleEditSubmit} className="flex flex-col items-center">
                 <input
                   autoFocus
                   type="number"
                   value={editValue}
                   onChange={(e) => setEditValue(e.target.value)}
                   onBlur={handleEditSubmit}
                   className="w-64 text-[120px] md:text-[160px] font-light tabular-nums tracking-tighter text-center bg-transparent border-none outline-none text-[var(--foreground)]"
                 />
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30 -mt-4">Set Minutes</span>
               </form>
             ) : (
               <motion.div
                 initial={false}
                 animate={{ color: MODES[mode].color }}
                 onClick={() => {
                   setEditValue(Math.floor(timeLeft / 60).toString());
                   setIsEditing(true);
                 }}
                 className="text-[120px] md:text-[160px] font-light tabular-nums tracking-tighter cursor-text hover:opacity-80 transition-opacity leading-none"
               >
                 {formatTime(timeLeft)}
               </motion.div>
             )}

             {/* Controls */}
             <div className="flex items-center gap-6 mt-8">
                <button
                  onClick={resetTimer}
                  className="p-4 rounded-full bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] transition-all hover:scale-110 active:scale-95 shadow-sm"
                >
                  <RotateCcw className="h-6 w-6" />
                </button>

                <button
                  onClick={toggleTimer}
                  className="group relative flex items-center justify-center h-24 w-24 rounded-full bg-[var(--foreground)] text-[var(--background)] transition-all hover:scale-110 active:scale-95 shadow-xl shadow-slate-900/10 dark:shadow-none"
                >
                   {isActive ? <Pause className="h-10 w-10 fill-current" /> : <Play className="h-10 w-10 fill-current ml-1" />}
                </button>

                <div className="p-4 rounded-full bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] shadow-sm">
                   <Brain className="h-6 w-6" />
                </div>
             </div>
          </div>

          {/* Bottom Minimal Quote */}
          <p className="mt-16 text-xs font-medium italic text-[var(--muted-foreground)] opacity-60 text-center max-w-sm leading-relaxed">
            "Concentrate all your thoughts upon the work at hand. The sun's rays do not burn until brought to a focus."
          </p>
        </div>

        {/* Right Panels Column */}
        <div className="w-full lg:w-[380px] flex flex-col gap-6 overflow-hidden">
          
          {/* Tasks Panel */}
          <div className="flex-1 flex flex-col min-h-0 rounded-[32px] bg-[var(--card)] border border-[var(--border)] overflow-hidden shadow-sm">
            <div className="p-6 border-b border-[var(--border)] flex items-center justify-between">
              <h2 className="font-bold text-lg text-[var(--foreground)]">{t("Focus Tasks")}</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--secondary)] text-[10px] font-black text-[var(--muted-foreground)] uppercase tracking-tight">
                {tasks.filter(t => t.completed).length} / {tasks.length}
              </span>
            </div>

            <div className="p-4">
              <form onSubmit={addTask} className="relative group">
                <input
                  type="text"
                  placeholder="What's your next win?"
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  className="w-full pl-5 pr-12 py-3 rounded-2xl bg-[var(--background)] border border-[var(--border)] focus:outline-none focus:ring-4 focus:ring-[var(--foreground)]/5 transition-all text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/50"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1.5 p-1.5 rounded-xl bg-[var(--foreground)] text-[var(--background)] hover:scale-105 active:scale-95 transition-all shadow-sm"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-6 custom-scrollbar space-y-2">
              <AnimatePresence initial={false}>
                {tasks.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 text-center text-slate-400 opacity-40"
                  >
                    <Circle className="h-10 w-10 mb-3 opacity-20" />
                    <p className="text-[11px] font-bold uppercase tracking-widest">No Active Tasks</p>
                  </motion.div>
                ) : (
                  tasks.map((task) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`group flex items-center gap-3 p-3.5 rounded-2xl transition-all duration-300 ${
                        task.completed 
                          ? "bg-[var(--secondary)]/50 opacity-50" 
                          : "bg-[var(--background)] border border-[var(--border)] shadow-sm hover:border-[var(--foreground)]/10"
                      }`}
                    >
                      <button
                        onClick={() => toggleTask(task.id)}
                        className={`transition-colors ${task.completed ? "text-emerald-500" : "text-slate-300 hover:text-slate-900"}`}
                      >
                        {task.completed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                      </button>
                      <span className={`flex-1 text-[13px] font-medium transition-all ${task.completed ? "line-through text-slate-400" : "text-slate-700"}`}>
                        {task.text}
                      </span>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-1.5 rounded-lg text-red-500/30 hover:text-red-500 hover:bg-red-500/5 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Sound Panel */}
          <div className="rounded-[32px] bg-[var(--card)] border border-[var(--border)] p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <Music className="h-4 w-4 text-[var(--foreground)]" />
                <span className="text-sm font-bold text-[var(--foreground)]">{t("Ambient Sounds")}</span>
              </div>
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-xl bg-[var(--secondary)] hover:bg-[var(--border)] transition-colors text-[var(--foreground)]"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-6">
              {SOUNDS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentSound(currentSound?.id === s.id ? null : s)}
                  className={`flex flex-col items-center gap-2 p-2.5 rounded-2xl transition-all ${
                    currentSound?.id === s.id 
                      ? "bg-[var(--foreground)] text-[var(--background)] shadow-lg shadow-slate-900/10 dark:shadow-none" 
                      : "bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]"
                  }`}
                >
                  <s.icon className="h-4 w-4" />
                  <span className="text-[9px] font-black uppercase truncate w-full text-center tracking-tighter">
                    {s.name.split(' ')[0]}
                  </span>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-[10px] uppercase font-black text-[var(--muted-foreground)] px-1">
                <span>Volume</span>
                <span className="tabular-nums">{Math.round(volume * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-1 bg-[var(--secondary)] rounded-full appearance-none cursor-pointer accent-[var(--foreground)]"
              />
            </div>
          </div>
        </div>
      </div>

      <audio ref={audioRef} />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.05);
          border-radius: 10px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.05);
        }
      `}</style>
    </div>
  );
}
