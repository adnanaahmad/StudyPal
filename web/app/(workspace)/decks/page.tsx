"use client";

import { useEffect, useState } from "react";
import { Presentation, Plus, FileText, Trash2, Layout, Download, Sparkles, Clock, Presentation as PresentationIcon, MonitorPlay } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { useTranslation } from "react-i18next";

interface DeckSummary {
  id: string;
  title: string;
  status: string;
  slides_count: number;
  created_at: number;
  file_url: string | null;
}

export default function DecksPage() {
  const { t } = useTranslation();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  // Creation State
  const [topic, setTopic] = useState("");
  const [sourceText, setSourceText] = useState("");

  useEffect(() => {
    fetchDecks();
  }, []);

  // Poll for generating decks
  useEffect(() => {
    if (!decks.some(d => d.status === 'generating' || d.status === 'extracting')) return;
    const interval = setInterval(fetchDecks, 3000);
    return () => clearInterval(interval);
  }, [decks]);

  const fetchDecks = async () => {
    try {
      const res = await fetch(apiUrl("/api/v1/decks"));
      if (res.ok) {
        setDecks(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!topic.trim() && !sourceText.trim()) return;

    setIsGenerating(true);
    try {
      const payload = {
        title: topic.trim() || "New Presentation",
        topic: topic.trim() || "General Overview",
        source_text: sourceText.trim() || null
      };

      const res = await fetch(apiUrl("/api/v1/decks/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setTopic("");
        setSourceText("");
        fetchDecks();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (fileUrl: string) => {
    window.open(apiUrl(fileUrl), '_blank');
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)] animate-fade-in relative">
      {/* Header — single row */}
      <div className="relative z-20 flex shrink-0 items-center justify-between border-b border-slate-100 bg-white/50 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/50 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <MonitorPlay
            size={18}
            strokeWidth={2}
            className="shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <h1 className="truncate text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
            {t("Presentation Decks")}
          </h1>
        </div>

        <button 
          type="button"
          onClick={() => {}} // Could scroll to form or focus
          className="flex shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition-all hover:scale-105 active:scale-95"
        >
          <Plus size={16} />
          {t("New Deck")}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Library */}
        <div className="w-[320px] border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col overflow-hidden">
          <div className="p-6 flex flex-col h-full">
            <h2 className="text-xs font-black text-[var(--muted-foreground)] uppercase tracking-widest mb-4">{t("Your Decks")}</h2>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
              {loading ? (
                [1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)
              ) : decks.length === 0 ? (
                <div className="py-12 text-center">
                  <PresentationIcon className="mx-auto h-8 w-8 text-slate-300 mb-3 opacity-50" />
                  <p className="text-[11px] font-medium text-slate-400">{t("No decks yet")}</p>
                </div>
              ) : (
                decks.map(deck => (
                  <div
                    key={deck.id}
                    className="w-full p-4 rounded-2xl border bg-[var(--card)] border-[var(--border)] hover:border-amber-500/30 transition-all group shadow-sm"
                  >
                    <h3 className="font-bold text-[13px] line-clamp-1 text-[var(--foreground)] mb-2">{deck.title}</h3>
                    <div className="flex items-center justify-between text-[10px] font-black text-[var(--muted-foreground)] uppercase">
                      <div className="flex items-center gap-2">
                        <Layout size={10} />
                        {deck.slides_count} slides
                      </div>
                      {deck.status === 'completed' && (
                        <button 
                          onClick={() => deck.file_url && handleDownload(deck.file_url)}
                          className="text-amber-600 hover:text-amber-500 transition-colors flex items-center gap-1"
                        >
                          <Download size={10} />
                          {t("Get")}
                        </button>
                      )}
                    </div>
                    {deck.status !== 'completed' && (
                      <div className="mt-3 h-1 w-full bg-[var(--secondary)] rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 w-1/3 animate-pulse" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 relative overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
            <div className="w-full max-w-xl">
              <div className="mb-12 text-center">
                <div className="w-20 h-20 bg-amber-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <Sparkles className="w-10 h-10 text-amber-600" />
                </div>
                <h2 className="text-2xl font-semibold tracking-tight mb-3 text-[var(--foreground)]">{t("Generate Slide Deck")}</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                  {t("Transform notes and papers into professional PowerPoint presentations.")}
                </p>
              </div>

              <div className="relative rounded-[40px] bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-8 shadow-sm overflow-hidden">
                {isGenerating && (
                  <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300">
                    <div className="h-12 w-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-black uppercase tracking-widest text-amber-600">{t("Crafting Slides...")}</p>
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t("Presentation Topic")}</label>
                    <input 
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-slate-300"
                      placeholder={t("e.g., Deep Learning in Healthcare")}
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      disabled={isGenerating}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t("Source Material (Optional)")}</label>
                    <textarea 
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl px-5 py-5 text-sm focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all min-h-[160px] resize-none placeholder:text-slate-300"
                      placeholder={t("Paste the content you want to turn into slides...")}
                      value={sourceText}
                      onChange={e => setSourceText(e.target.value)}
                      disabled={isGenerating}
                    />
                  </div>

                  <button 
                    onClick={handleCreate}
                    disabled={isGenerating || (!topic.trim() && !sourceText.trim())}
                    className="w-full flex items-center justify-center gap-3 bg-amber-600 hover:bg-amber-500 text-white h-14 rounded-2xl font-bold transition-all disabled:opacity-30 disabled:grayscale shadow-xl shadow-amber-500/20 active:scale-[0.98]"
                  >
                    {isGenerating ? <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Layout size={20} />}
                    {isGenerating ? t("Initializing...") : t("Generate Deck")}
                  </button>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-center gap-6 opacity-40">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-tighter">
                  <div className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">P</div>
                  PowerPoint
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-tighter">
                  <div className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">G</div>
                  Google Slides
                </div>
              </div>
            </div>
          </div>
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
