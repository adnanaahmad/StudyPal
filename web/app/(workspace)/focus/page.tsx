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
  Music2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ── Types & Constants ── */

type TimerMode = "focus" | "shortBreak" | "longBreak";

const MODES: Record<TimerMode, { label: string; duration: number; color: string; bg: string }> = {
  focus: { 
    label: "Focus", 
    duration: 25 * 60, 
    color: "oklch(62.8% 0.257 25.54)", // Deep red/orange
    bg: "bg-orange-500/10"
  },
  shortBreak: { 
    label: "Short Break", 
    duration: 5 * 60, 
    color: "oklch(76.8% 0.177 163.22)", // Soft teal
    bg: "bg-teal-500/10"
  },
  longBreak: { 
    label: "Long Break", 
    duration: 15 * 60, 
    color: "oklch(66.6% 0.179 258.92)", // Indigo
    bg: "bg-indigo-500/10"
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
  const [mode, setMode] = useState<TimerMode>("focus");
  const [timeLeft, setTimeLeft] = useState(MODES.focus.duration);
  const [isActive, setIsActive] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [currentSound, setCurrentSound] = useState<Sound | null>(null);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [pomodorosCompleted, setPomodorosCompleted] = useState(0);

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

  /* ── Sound Logic ── */

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentSound && !isMuted) {
      // Avoid re-setting the same source to prevent interruptions
      if (audio.src !== currentSound.url) {
        audio.src = currentSound.url;
        audio.load(); // Ensure new source is loaded
      }
      
      audio.loop = true;
      audio.volume = volume;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.error("[FocusApp] Audio playback failed:", err);
          if (err.name === "NotSupportedError") {
            console.error("[FocusApp] Source not supported or unreachable:", currentSound.url);
          }
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
    <div className="relative min-h-screen w-full bg-[var(--background)] text-[var(--foreground)] selection:bg-primary/20 overflow-x-hidden">
      {/* Dynamic Background */}
      <div className={`absolute inset-0 z-0 transition-colors duration-1000 ${MODES[mode].bg} opacity-40`} />
      <div className="absolute inset-0 z-0 overflow-hidden opacity-20 pointer-events-none">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/4 -right-1/4 w-[800px] h-[800px] rounded-full bg-radial from-primary/20 to-transparent blur-3xl" 
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            rotate: [0, -90, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-1/4 -left-1/4 w-[800px] h-[800px] rounded-full bg-radial from-blue-500/20 to-transparent blur-3xl" 
        />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12 md:py-20 grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left Column: Timer */}
        <div className="lg:col-span-7 flex flex-col items-center">
          
          {/* Mode Tabs */}
          <div className="flex gap-2 p-1 rounded-2xl bg-[var(--card)]/50 border border-[var(--border)]/50 backdrop-blur-xl mb-12 shadow-sm">
            {(Object.keys(MODES) as TimerMode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  mode === m 
                    ? "bg-[var(--background)] text-[var(--foreground)] shadow-lg scale-105" 
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--background)]/30"
                }`}
              >
                {MODES[m].label}
              </button>
            ))}
          </div>

          {/* Timer Display */}
          <div className="relative flex flex-col items-center justify-center">
             <motion.div
               initial={false}
               animate={{ color: MODES[mode].color }}
               className="text-[120px] md:text-[180px] font-black tabular-nums tracking-tight drop-shadow-2xl"
             >
               {formatTime(timeLeft)}
             </motion.div>

             {/* Controls */}
             <div className="flex items-center gap-6 mt-4">
                <button
                  onClick={resetTimer}
                  className="p-4 rounded-full bg-[var(--card)]/80 text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]/50 transition-all hover:scale-110 active:scale-95 backdrop-blur-md"
                >
                  <RotateCcw className="h-6 w-6" />
                </button>

                <button
                  onClick={toggleTimer}
                  className="group relative flex items-center justify-center h-24 w-24 rounded-full bg-primary text-white shadow-2xl shadow-primary/40 transition-all hover:scale-110 active:scale-95"
                >
                   <div className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-20 scale-125" />
                   {isActive ? <Pause className="h-10 w-10 fill-current" /> : <Play className="h-10 w-10 fill-current ml-1" />}
                </button>

                <div className="p-4 rounded-full bg-[var(--card)]/80 text-[var(--muted-foreground)] border border-[var(--border)]/50 backdrop-blur-md">
                   <span className="text-lg font-bold">#{pomodorosCompleted + 1}</span>
                </div>
             </div>
          </div>

          {/* Sound Controller */}
          <div className="mt-16 w-full max-w-md p-6 rounded-3xl bg-[var(--card)]/30 border border-[var(--border)]/30 backdrop-blur-xl shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Music className="h-5 w-5 text-primary" />
                <span className="font-semibold">Ambient Sounds</span>
              </div>
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-xl bg-[var(--background)]/50 hover:bg-[var(--background)] transition-colors"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-6">
              {SOUNDS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentSound(currentSound?.id === s.id ? null : s)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${
                    currentSound?.id === s.id 
                      ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105" 
                      : "bg-[var(--background)]/50 text-[var(--muted-foreground)] hover:bg-[var(--background)]"
                  }`}
                >
                  <s.icon className="h-5 w-5" />
                  <span className="text-[10px] font-bold uppercase truncate w-full text-center">{s.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-[10px] uppercase font-bold text-[var(--muted-foreground)] px-1">
                <span>Volume</span>
                <span>{Math.round(volume * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[var(--border)] rounded-full appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Tasks */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="flex flex-col h-full p-8 rounded-[40px] bg-[var(--card)]/50 border border-[var(--border)]/50 backdrop-blur-2xl shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold tracking-tight">Focus Tasks</h2>
              <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                {tasks.filter(t => t.completed).length}/{tasks.length}
              </div>
            </div>

            <form onSubmit={addTask} className="relative mb-8 group">
              <input
                type="text"
                placeholder="What are you working on?"
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                className="w-full pl-6 pr-14 py-4 rounded-2xl bg-[var(--background)]/50 border border-[var(--border)]/50 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-[var(--muted-foreground)]/50"
              />
              <button
                type="submit"
                className="absolute right-2 top-2 p-2 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Plus className="h-6 w-6" />
              </button>
            </form>

            <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
              <AnimatePresence initial={false}>
                {tasks.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center py-12 text-center text-[var(--muted-foreground)] opacity-50"
                  >
                    <Brain className="h-12 w-12 mb-4" />
                    <p className="text-sm">No tasks added yet.<br/>Start small, win big.</p>
                  </motion.div>
                ) : (
                  tasks.map((task) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={`group flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 ${
                        task.completed 
                          ? "bg-[var(--background)]/30 opacity-60" 
                          : "bg-[var(--background)] border border-[var(--border)]/50 shadow-sm hover:shadow-md"
                      }`}
                    >
                      <button
                        onClick={() => toggleTask(task.id)}
                        className={`transition-colors ${task.completed ? "text-emerald-500" : "text-[var(--muted-foreground)] hover:text-primary"}`}
                      >
                        {task.completed ? <CheckCircle2 className="h-6 w-6" /> : <Circle className="h-6 w-6" />}
                      </button>
                      <span className={`flex-1 text-sm font-medium transition-all ${task.completed ? "line-through" : ""}`}>
                        {task.text}
                      </span>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-2 rounded-lg text-red-500/50 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Bottom Quote */}
            <div className="mt-8 pt-8 border-t border-[var(--border)]/30">
               <p className="text-xs italic text-[var(--muted-foreground)] opacity-70 text-center">
                 "Concentrate all your thoughts upon the work at hand. The sun's rays do not burn until brought to a focus."
               </p>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Audio Element */}
      <audio ref={audioRef} />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--muted-foreground);
        }
      `}</style>
    </div>
  );
}
