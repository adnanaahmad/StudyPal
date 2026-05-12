"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Layout, Presentation } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const LOADING_STEPS = [
  "Analyzing material...",
  "Structuring presentation...",
  "Drafting slides...",
  "Designing layout...",
  "Polishing graphics...",
  "Finalizing PowerPoint..."
];

export function DeckLoading() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % LOADING_STEPS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-50 flex flex-col items-center justify-center p-8"
    >
      <div className="relative w-64 h-64 flex items-center justify-center">
        {/* Ambient Glow */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 rounded-full bg-amber-500/20 blur-3xl"
        />

        {/* Floating Slides Animation */}
        <div className="relative">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ 
                opacity: 0, 
                scale: 0.8, 
                rotate: -10 * i,
                x: "-50%",
                y: "-50%" 
              }}
              animate={{
                opacity: [0.4, 1, 0.4],
                scale: [0.9, 1.1, 0.9],
                rotate: [-10 * i, -5 * i, -10 * i],
                x: "-50%",
                y: ["-50%", "-65%", "-50%"],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                delay: i * 0.8,
                ease: "easeInOut",
              }}
              className="absolute top-1/2 left-1/2 w-40 h-28 bg-white dark:bg-slate-800 border border-amber-500/20 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-center overflow-hidden"
              style={{ zIndex: 10 - i, marginLeft: i * 20, marginTop: i * 15 }}
            >
              <div className="relative z-10">
                {i === 0 ? (
                  <Presentation className="w-10 h-10 text-amber-600" />
                ) : i === 1 ? (
                  <Layout className="w-8 h-8 text-amber-500/50" />
                ) : (
                  <Sparkles className="w-6 h-6 text-amber-400/30" />
                )}
              </div>
              
              {/* Background decorative lines */}
              <div className="absolute inset-0 p-4 flex flex-col gap-2 opacity-[0.03] dark:opacity-[0.05]">
                <div className="h-2 w-2/3 bg-amber-500 rounded" />
                <div className="h-2 w-full bg-amber-500 rounded" />
                <div className="h-2 w-full bg-amber-500 rounded" />
                <div className="h-2 w-1/2 bg-amber-500 rounded" />
              </div>

              {/* Shimmer line */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent -translate-x-full"
                animate={{ translateX: ["100%", "-100%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mt-16 text-center space-y-4 max-w-sm">
        <div className="h-10 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.h2
              key={step}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="text-2xl font-bold tracking-tight text-[var(--foreground)]"
            >
              {t(LOADING_STEPS[step])}
            </motion.h2>
          </AnimatePresence>
        </div>
        
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("Our AI is transforming your content into a professional presentation. This may take a moment.")}
        </p>

        {/* Progress Dots */}
        <div className="flex justify-center gap-1.5 pt-4">
          {LOADING_STEPS.map((_, i) => (
            <motion.div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === step ? "w-6 bg-amber-600" : "w-1.5 bg-slate-200 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
