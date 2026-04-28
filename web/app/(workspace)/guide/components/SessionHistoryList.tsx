"use client";

import {
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { SessionSummary } from "../types";
import { useTranslation } from "react-i18next";

interface SessionHistoryListProps {
  sessions: SessionSummary[];
  loading: boolean;
  onLoadSession: (sessionId: string) => void;
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <CheckCircle2 className="w-3 h-3" />
        {t("Completed")}
      </span>
    );
  }
  if (status === "learning") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
        <BookOpen className="w-3 h-3" />
        {t("In Progress")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
      <FileText className="w-3 h-3" />
      {t("Planned")}
    </span>
  );
}

export default function SessionHistoryList({
  sessions,
  loading,
  onLoadSession,
}: SessionHistoryListProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8">
        <Loader2 className="w-8 h-8 animate-spin mb-3" />
        <p className="text-sm">{t("Loading history...")}</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 p-8">
        <GraduationCap className="w-20 h-20 mb-4" />
        <h3 className="text-base font-medium text-slate-500 dark:text-slate-400 mb-1">
          {t("No learning history yet")}
        </h3>
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center max-w-sm">
          {t(
            "Describe what you want to learn on the left, and your guided learning sessions will appear here.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t("Learning History")}
        </h3>
        <span className="text-[10px] text-slate-400 font-medium bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded-full">
          {sessions.length} {t("sessions")}
        </span>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3">
        {sessions.map((session) => (
          <button
            key={session.session_id}
            onClick={() => onLoadSession(session.session_id)}
            className="group text-left rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-xl hover:border-primary/40 hover:-translate-y-1 transition-all duration-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-primary/60 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-primary" />
              </div>
            </div>

            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-2 mb-3 pr-6 group-hover:text-primary transition-colors">
              {session.topic || t("Untitled")}
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <StatusBadge status={session.status} />
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1 bg-slate-50 dark:bg-slate-900/50 px-2 py-0.5 rounded-md">
                <Clock className="w-3 h-3" />
                {new Date(session.created_at * 1000).toLocaleDateString()}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase">
                  {t("Progress")}
                </span>
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">
                  {session.ready_count}/{session.total_points}
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${session.progress}%` }}
                />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
