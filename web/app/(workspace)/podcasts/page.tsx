"use client";

import { useEffect, useState } from "react";
import { Headphones, Plus, FileText, Trash2, Clock } from "lucide-react";
import { PodcastLoading } from "@/components/podcasts/PodcastLoading";
import { PodcastPlayer } from "@/components/podcasts/PodcastPlayer";
import { apiUrl } from "@/lib/api";

interface PodcastSummary {
  id: string;
  title: string;
  duration: number;
  audio_url: string;
  status: string;
  created_at: number;
}

export default function PodcastsPage() {
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
        // Start polling
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
            fetchPodcasts(); // refresh library
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

  if (view === 'playing' && activePodcastData) {
    return (
      <PodcastPlayer 
        podcast={activePodcastData} 
        onBack={() => setView('library')} 
      />
    );
  }

  return (
    <div className="flex h-full flex-col max-w-5xl mx-auto p-8 overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] tracking-tight">Audio Overviews</h1>
          <p className="text-[var(--muted-foreground)] mt-2">Listen to AI-generated discussions of your study materials.</p>
        </div>
      </div>

      {/* Creation Modal / Inline Form */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 mb-12 shadow-sm">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Headphones size={20} className="text-blue-500" />
          Create New Podcast
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Topic or Subject</label>
            <input 
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="e.g., The implications of Quantum Mechanics"
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Source Material (Optional)</label>
            <textarea 
              className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[100px] resize-y"
              placeholder="Paste your notes, essay, or document text here..."
              value={fileContent}
              onChange={e => setFileContent(e.target.value)}
            />
          </div>
          <div className="flex justify-end pt-2">
            <button 
              onClick={handleCreate}
              disabled={!topic.trim() && !fileContent.trim()}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-5 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SparklesIcon size={18} />
              Generate Podcast
            </button>
          </div>
        </div>
      </div>

      {/* Library Grid */}
      <div>
        <h2 className="text-xl font-semibold mb-6">Your Library</h2>
        {loading ? (
          <div className="text-sm text-[var(--muted-foreground)]">Loading...</div>
        ) : podcasts.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-dashed border-[var(--border)]">
            <Headphones className="mx-auto h-12 w-12 text-[var(--muted-foreground)] opacity-50 mb-3" />
            <p className="text-[var(--muted-foreground)]">No podcasts yet. Create your first one above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {podcasts.map(p => (
              <div 
                key={p.id} 
                className="group relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 hover:border-blue-500/50 transition-colors cursor-pointer flex flex-col h-[180px]"
                onClick={() => p.status === 'completed' && handlePlay(p.id)}
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-lg line-clamp-2">{p.title}</h3>
                  <div className="flex items-center gap-4 mt-3 text-sm text-[var(--muted-foreground)]">
                    <span className="flex items-center gap-1.5"><Clock size={14}/> {Math.floor(p.duration / 60)}:{Math.floor(p.duration % 60).toString().padStart(2, '0')}</span>
                    <span className="capitalize">{p.status}</span>
                  </div>
                </div>
                
                {p.status === 'completed' ? (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex -space-x-2">
                      <div className="h-8 w-8 rounded-full bg-cyan-500/20 border border-cyan-500 flex items-center justify-center text-xs font-bold text-cyan-400">S</div>
                      <div className="h-8 w-8 rounded-full bg-purple-500/20 border border-purple-500 flex items-center justify-center text-xs font-bold text-purple-400">A</div>
                    </div>
                    <button className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0">
                      <PlayIcon size={20} className="ml-1" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 h-1 w-full bg-[var(--secondary)] rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 w-1/2 animate-pulse rounded-full" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SparklesIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>
  );
}

function PlayIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" {...props}><polygon points="6 3 20 12 6 21 6 3"/></svg>
  );
}
