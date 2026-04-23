"use client";

import { motion } from "framer-motion";
import { Headphones, Sparkles, Mic2 } from "lucide-react";

export function PodcastLoading() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--background)] p-8">
      <div className="relative flex h-48 w-48 items-center justify-center">
        {/* Glow backdrop */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 rounded-full bg-blue-500/20 blur-3xl"
        />

        {/* Central rings */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-full border border-blue-500/30"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{
              scale: [0.5, 1.5],
              opacity: [0.8, 0],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: i * 0.8,
              ease: "easeOut",
            }}
          />
        ))}

        {/* Icon container */}
        <motion.div
          className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-xl shadow-blue-500/20"
          animate={{
            y: [-5, 5, -5],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Headphones className="h-10 w-10 text-white" />
          
          <motion.div
            className="absolute -right-2 -top-2"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          >
            <Sparkles className="h-6 w-6 text-yellow-300" />
          </motion.div>
        </motion.div>
      </div>

      <div className="mt-8 text-center space-y-4 max-w-md">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Synthesizing Conversation...
        </h2>
        <p className="text-[var(--muted-foreground)]">
          Our AI hosts, Sarah and Alex, are currently reading your material, debating the key points, and recording the audio. This can take a minute for a deep dive!
        </p>

        {/* Fake Equalizer */}
        <div className="flex justify-center items-end gap-1.5 h-12 mt-6">
          {Array.from({ length: 20 }).map((_, i) => (
            <motion.div
              key={i}
              className="w-1.5 bg-gradient-to-t from-blue-500 to-purple-500 rounded-t-sm"
              animate={{
                height: ["10%", "100%", "10%"],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.05,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
