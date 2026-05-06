"use client";

import { useEffect, useState } from "react";
import { Headphones, Plus, FileText, Trash2, Clock, Sparkles, Play, ChevronRight, Mic2 } from "lucide-react";
import { PodcastLoading } from "@/components/podcasts/PodcastLoading";
import { PodcastPlayer } from "@/components/podcasts/PodcastPlayer";
import { apiUrl } from "@/lib/api";
import { useTranslation } from "react-i18next";

interface PodcastSummary {
  id: string;
  title: string;
  duration: number;
  audio_url: string;
  status: string;
  created_at: number;
}

export default function PodcastsPage() {
  const { t } = useTranslation();
  const [podcasts, setPodcasts] = useState<PodcastSummary[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Views: 'library', 'creating', 'playing'
  const [view, setView] = useState<'library' | 'creating' | 'playing'>('library');
  const [activePodcastId, setActivePodcastId] = useState<string | null>(null);
  const [activePodcastData, setActivePodcastData] = useState<any>(null);

  // Creation State
  const [topic, setTopic] = useState("");
  const [fileContent, setFileContent] = useState("");

  useEffect(() => {
    fetchPodcasts();
  }, []);

  // Poll for generating podcasts
  useEffect(() => {
    if (!podcasts.some(p => p.status === 'generating' || p.status === 'synthesizing')) return;
    const interval = setInterval(fetchPodcasts, 3000);
    return () => clearInterval(interval);
  }, [podcasts]);

  const fetchPodcasts = async () => {
    try {
      const res = await fetch(apiUrl("/api/v1/podcasts"));
      if (res.ok) {
        setPodcasts(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!topic.trim() && !fileContent.trim()) return;
    
    setView('creating');
    try {
      const payload = {
        title: topic.trim() || "Notes Overview",
        topic: topic.trim() || "General Overview",
        file_content: fileContent.trim() || null
      };

      const res = await fetch(apiUrl("/api/v1/podcasts/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        const data = await res.json();
        setActivePodcastId(data.id);
        pollPodcastStatus(data.id);
      }
    } catch (e) {
      console.error(e);
      setView('library');
    }
  };

  const pollPodcastStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/v1/podcasts/${id}`));
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'completed') {
            clearInterval(interval);
            setActivePodcastData(data);
            setView('playing');
            fetchPodcasts();
          } else if (data.status === 'failed') {
            clearInterval(interval);
            setView('library');
            alert("Podcast generation failed.");
          }
        }
      } catch (e) {
        // ignore network errors on poll
      }
    }, 2000);
  };

  const handlePlay = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/api/v1/podcasts/${id}`));
      if (res.ok) {
        setActivePodcastData(await res.json());
        setView('playing');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (view === 'creating') {
    return <PodcastLoading />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)] animate-fade-in relative">
      {/* Header Section */}
      <div className="relative z-20 flex items-center justify-between px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-blue-600 dark:text-blue-400">
            <Mic2 size={14} strokeWidth={2.5} />
            <span className="text-[11px] font-bold uppercase tracking-wider">{t("Workshop")}</span>
          </div>
          <h1 className="font-serif text-2xl font-medium tracking-tight text-[var(--foreground)]">
            {t("Audio Overviews")}
          </h1>
        </div>
        
        <button 
          onClick={() => setView('library')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            view === 'library' 
              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed" 
              : "bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95"
          }`}
        >
          <Plus size={16} />
          {t("New Overview")}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Library */}
        <div className="w-[320px] border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col overflow-hidden">
          <div className="p-6 flex flex-col h-full">
            <h2 className="text-xs font-black text-[var(--muted-foreground)] uppercase tracking-widest mb-4">{t("Your Library")}</h2>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2">
              {loading ? (
                [1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)
              ) : podcasts.length === 0 ? (
                <div className="py-12 text-center">
                  <Headphones className="mx-auto h-8 w-8 text-slate-300 mb-3 opacity-50" />
                  <p className="text-[11px] font-medium text-slate-400">{t("No podcasts yet")}</p>
                </div>
              ) : (
                podcasts.map(p => (
                  <button
                    key={p.id}
                    onClick={() => p.status === 'completed' && handlePlay(p.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all ${
                      activePodcastId === p.id 
                        ? "bg-[var(--card)] border-blue-500/30 shadow-md ring-1 ring-blue-500/10" 
                        : "bg-[var(--card)]/50 border-[var(--border)] hover:border-blue-500/20"
                    }`}
                  >
                    <h3 className="font-bold text-[13px] line-clamp-1 text-[var(--foreground)]">{p.title}</h3>
                    <div className="flex items-center gap-3 mt-2 text-[10px] font-black text-[var(--muted-foreground)] uppercase">
                      <span className="flex items-center gap-1"><Clock size={10}/> {Math.floor(p.duration / 60)}:{Math.floor(p.duration % 60).toString().padStart(2, '0')}</span>
                      <span className={p.status === 'completed' ? "text-emerald-500" : "text-blue-500 animate-pulse"}>{p.status}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 relative overflow-hidden">
          {view === 'playing' && activePodcastData ? (
            <div className="h-full overflow-y-auto">
              <PodcastPlayer 
                podcast={activePodcastData} 
                onBack={() => setView('library')} 
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
              <div className="w-full max-w-xl">
                <div className="mb-12 text-center">
                  <div className="w-20 h-20 bg-blue-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <Sparkles className="w-10 h-10 text-blue-600" />
                  </div>
                  <h2 className="font-serif text-3xl font-medium mb-3">{t("Create an Audio Overview")}</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">{t("Transform your materials into an AI-powered conversational deep dive.")}</p>
                </div>

                <div className="space-y-6 rounded-[40px] bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t("Topic or Subject")}</label>
                    <input 
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300"
                      placeholder={t("e.g., The implications of Quantum Mechanics")}
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t("Source Material (Optional)")}</label>
                    <textarea 
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl px-5 py-5 text-sm focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all min-h-[160px] resize-none placeholder:text-slate-300"
                      placeholder={t("Paste your notes, essay, or document text here...")}
                      value={fileContent}
                      onChange={e => setFileContent(e.target.value)}
                    />
                  </div>

                  <button 
                    onClick={handleCreate}
                    disabled={!topic.trim() && !fileContent.trim()}
                    className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-500 text-white h-14 rounded-2xl font-bold transition-all disabled:opacity-30 disabled:grayscale shadow-xl shadow-blue-500/20 active:scale-[0.98]"
                  >
                    <Sparkles size={20} />
                    {t("Generate Podcast")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
