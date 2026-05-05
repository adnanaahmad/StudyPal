"use client";

import { useEffect, useState } from "react";
import { Presentation, Plus, FileText, Trash2, Layout, Download, Sparkles, Clock } from "lucide-react";
import { apiUrl } from "@/lib/api";

interface DeckSummary {
  id: string;
  title: string;
  status: string;
  slides_count: number;
  created_at: number;
  file_url: string | null;
}

export default function DecksPage() {
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
    <div className="flex h-full flex-col max-w-6xl mx-auto p-8 overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] tracking-tight">Presentation Decks</h1>
          <p className="text-[var(--muted-foreground)] mt-2">Transform your notes and papers into professional slide decks.</p>
        </div>
      </div>

      {/* Creation Section */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 mb-12 shadow-sm relative">
        {isGenerating && (
          <div className="absolute inset-0 bg-[var(--card)]/60 backdrop-blur-[2px] z-20 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-semibold text-blue-600">Preparing your slides...</p>
            </div>
          </div>
        )}

        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Sparkles size={20} className="text-amber-500" />
          Generate New Deck
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Presentation Topic</label>
              <input
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="e.g., Deep Learning in Healthcare"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                disabled={isGenerating}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Source Material (Optional)</label>
              <textarea
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[120px] resize-none"
                placeholder="Paste the content you want to turn into slides..."
                value={sourceText}
                onChange={e => setSourceText(e.target.value)}
                disabled={isGenerating}
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={isGenerating || (!topic.trim() && !sourceText.trim())}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-3 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {isGenerating ? (
                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Layout size={18} />
              )}
              {isGenerating ? "Initializing..." : "Generate Slide Deck"}
            </button>
          </div>

          <div className="hidden md:flex flex-col items-center justify-center border-l border-[var(--border)] pl-8 text-center text-[var(--muted-foreground)]">
            <div className="h-16 w-16 rounded-2xl bg-[var(--secondary)] flex items-center justify-center mb-4 text-[var(--foreground)]">
              <Download size={24} />
            </div>
            <p className="text-sm px-6">
              Decks are exported as <b>.pptx</b> files, ready to be opened in PowerPoint, Keynote, or Google Slides.
            </p>
          </div>
        </div>
      </div>

      {/* Library Section */}
      <div>
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <FileText size={20} className="text-blue-500" />
          Recent Decks
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-xl bg-[var(--secondary)] animate-pulse" />
            ))}
          </div>
        ) : decks.length === 0 ? (
          <div className="text-center py-20 rounded-xl border border-dashed border-[var(--border)]">
            <Presentation className="mx-auto h-16 w-16 text-[var(--muted-foreground)] opacity-20 mb-4" />
            <h3 className="text-lg font-medium text-[var(--foreground)]">No decks yet</h3>
            <p className="text-[var(--muted-foreground)] max-w-xs mx-auto mt-1">
              Start by entering a topic or pasting some notes above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {decks.map(deck => (
              <div
                key={deck.id}
                className="group relative rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden hover:border-blue-500/50 transition-all shadow-sm"
              >
                <div className="aspect-video bg-[var(--secondary)] flex items-center justify-center relative">
                  <Presentation size={40} className="text-[var(--muted-foreground)] opacity-30" />
                  {deck.status === 'completed' && (
                    <button
                      onClick={() => deck.file_url && handleDownload(deck.file_url)}
                      className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                    >
                      <div className="bg-white text-blue-600 px-4 py-2 rounded-full font-semibold text-sm shadow-lg flex items-center gap-2">
                        <Download size={16} />
                        Download
                      </div>
                    </button>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-[var(--foreground)] truncate">{deck.title}</h3>
                  <div className="flex items-center justify-between mt-2 text-xs text-[var(--muted-foreground)]">
                    <div className="flex items-center gap-1">
                      <Layout size={12} />
                      {deck.slides_count} slides
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(deck.created_at * 1000).toLocaleDateString()}
                    </div>
                  </div>
                  {deck.status !== 'completed' && (
                    <div className="mt-3 h-1 w-full bg-[var(--secondary)] rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 w-1/3 animate-progress rounded-full" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
