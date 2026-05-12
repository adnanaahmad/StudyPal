"use client";

import { motion } from "framer-motion";
import { Sparkles, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function SidebarDeckLoading() {
  const { t } = useTranslation();

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
          <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest animate-pulse">
            {t("Preparing...")}
          </span>
        </div>
        <Sparkles className="w-3 h-3 text-amber-400" />
      </div>
      
      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-amber-400 via-amber-600 to-amber-400"
          initial={{ width: "10%", x: "-100%" }}
          animate={{ 
            width: ["20%", "40%", "20%"],
            x: ["-100%", "400%"] 
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>
    </div>
  );
}
