"""
Podcast Generator Service
Handles LLM script generation and TTS audio synthesis.
"""

import asyncio
import json
import logging
import uuid
from typing import Any

from deeptutor.services.llm import get_llm_client
from deeptutor.services.session.sqlite_podcast_store import get_sqlite_podcast_store
from deeptutor.services.path_service import get_path_service

logger = logging.getLogger(__name__)

# Try to import Kokoro if installed, otherwise use mock
try:
    from kokoro import KPipeline
    import soundfile as sf
    KOKORO_AVAILABLE = True
except ImportError:
    KOKORO_AVAILABLE = False
    logger.warning("Kokoro is not installed or incompatible with this environment. Using mock TTS.")

PODCAST_SYSTEM_PROMPT = """\
You are an expert podcast scriptwriter. 
Your task is to convert the user's study materials or topic into a conversational, engaging, and educational podcast script between two AI hosts: Host A (Sarah) and Host B (Alex).

RULES:
1. Output MUST be a valid JSON object containing a single key "script" which holds an array of dialogue objects.
2. Each dialogue object MUST have exactly these keys: "speaker" (either "Sarah" or "Alex"), and "text" (the spoken line).
3. Keep the conversation dynamic, debate-style, and engaging. Avoid overly long monologues (max 3-4 sentences per turn).
4. CRITICAL LENGTH REQUIREMENT: You MUST generate a long, comprehensive discussion containing AT LEAST 15 to 25 dialogue turns. Do NOT cut the conversation short. 
5. Write the full podcast episode exploring the nuances of the topic from the introduction, through the deep dive, to the conclusion.

EXAMPLE OUTPUT:
{
  "script": [
    {"speaker": "Sarah", "text": "Welcome to the Audio Overview! Today we're diving into the fascinating world of Phases."},
    {"speaker": "Alex", "text": "That's right, Sarah. And it's not just theory—it changes how we see reality itself."},
    {"speaker": "Sarah", "text": "Exactly. Let's start with the basics. What exactly do we mean when we talk about a phase?"},
    {"speaker": "Alex", "text": "Well, in physics, a phase is a distinct and homogeneous state of a system with no visible boundary separating it into parts."}
  ]
}
"""

class PodcastGenerator:
    def __init__(self):
        self.store = get_sqlite_podcast_store()
        self.path_service = get_path_service()
        # Initialize Kokoro Pipeline if available
        if KOKORO_AVAILABLE:
            try:
                # 'a' for American English
                self.pipeline = KPipeline(lang_code='a')
            except Exception as e:
                logger.error(f"Failed to initialize Kokoro pipeline: {e}")
                self.pipeline = None
        else:
            self.pipeline = None

    async def generate_podcast(self, podcast_id: str, topic: str, file_content: str | None = None) -> None:
        """Background task to generate the script and synthesize audio."""
        try:
            # 1. Generate Script via LLM
            logger.info(f"[{podcast_id}] Generating script...")
            llm_client = get_llm_client()
            
            prompt_parts = []
            if file_content:
                prompt_parts.append(f"Source Material:\n{file_content[:15000]}")
            prompt_parts.append(f"Topic: {topic}")
            
            user_message = "\n\n".join(prompt_parts)
            
            raw_script = await llm_client.complete(
                prompt=user_message,
                system_prompt=PODCAST_SYSTEM_PROMPT,
                max_tokens=4096,
                response_format={"type": "json_object"} if hasattr(llm_client, "is_openai") else None
            )
            
            # Clean and parse JSON
            raw_script = raw_script.strip()
            if raw_script.startswith("```json"):
                raw_script = raw_script[7:-3].strip()
            elif raw_script.startswith("```"):
                raw_script = raw_script[3:-3].strip()
                
            import json_repair
            script = json_repair.loads(raw_script)
            if isinstance(script, dict) and "script" in script:
                script = script["script"]
                
            # Ensure it's a list
            if not isinstance(script, list):
                script = [{"speaker": "Sarah", "text": "Sorry, I couldn't understand the material."}]
            
            # Save script progress
            await self.store.update_podcast(podcast_id, {
                "script_json": script,
                "status": "synthesizing"
            })
            
            # 2. Synthesize Audio
            logger.info(f"[{podcast_id}] Synthesizing audio...")
            audio_filename = f"{podcast_id}.wav"
            outputs_dir = self.path_service.get_public_outputs_root() / "podcasts"
            outputs_dir.mkdir(parents=True, exist_ok=True)
            audio_path = outputs_dir / audio_filename
            
            duration, updated_script = await self._synthesize_audio(script, str(audio_path))
            
            # 3. Update Status
            await self.store.update_podcast(podcast_id, {
                "script_json": updated_script,
                "duration": duration,
                "audio_url": f"/api/outputs/podcasts/{audio_filename}",
                "status": "completed"
            })
            
        except Exception as e:
            logger.error(f"[{podcast_id}] Podcast generation failed: {e}", exc_info=True)
            await self.store.update_podcast(podcast_id, {"status": "failed"})

    async def _synthesize_audio(self, script: list[dict[str, Any]], output_path: str) -> tuple[float, list[dict[str, Any]]]:
        """Synthesize audio chunks and stitch them. Returns total duration in seconds and updated script."""
        if not KOKORO_AVAILABLE or self.pipeline is None:
            # MOCK SYNTHESIS: Generate a fake tone WAV file if Kokoro fails
            logger.info("Using mock audio synthesis.")
            import wave
            import struct
            import math
            
            # Better Mock: 3 seconds per dialogue
            duration_per_line = 3.0
            total_duration = max(len(script), 1) * duration_per_line
            sample_rate = 24000
            
            # Generate a soft 440Hz tone chunk for one line to avoid silent output
            audio_data = []
            for i in range(int(sample_rate * duration_per_line)):
                value = int(2000 * math.sin(2 * math.pi * 440 * i / sample_rate))
                audio_data.append(struct.pack('h', value))
            chunk = b''.join(audio_data)
            
            with wave.open(output_path, 'w') as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(sample_rate)
                for _ in range(max(len(script), 1)):
                    wav_file.writeframes(chunk)
                    
            current_time = 0.0
            updated_script = []
            for line in script:
                if not isinstance(line, dict):
                    continue
                line["timestamp"] = current_time
                line["end_time"] = current_time + duration_per_line
                current_time += duration_per_line
                updated_script.append(line)
                
            return total_duration, updated_script
            
        # REAL KOKORO SYNTHESIS
        import soundfile as sf
        import numpy as np
        
        all_audio = []
        sample_rate = 24000
        
        # Voice mapping
        voices = {
            "Sarah": "af_bella",  # American female
            "Alex": "am_adam"     # American male
        }
        
        # Run synthesis in thread to avoid blocking event loop
        def _run_synth():
            current_time = 0.0
            updated_script = []
            
            for line in script:
                if not isinstance(line, dict):
                    continue
                    
                speaker = line.get("speaker", "Sarah")
                text = line.get("text", "")
                if not text:
                    continue
                    
                voice = voices.get(speaker, "af_bella")
                
                try:
                    # generate yields chunks: graphemes, phonemes, audio
                    generator = self.pipeline(text, voice=voice, speed=1.0)
                    line_audio = []
                    for _, _, audio_chunk in generator:
                        line_audio.append(audio_chunk)
                        all_audio.append(audio_chunk)
                        
                    if line_audio:
                        line_dur = len(np.concatenate(line_audio)) / sample_rate
                    else:
                        line_dur = 0.0
                except Exception as e:
                    logger.error(f"Failed to synthesize line '{text[:20]}': {e}")
                    line_dur = 0.0
                    
                if line_dur > 0:
                    line["timestamp"] = current_time
                    line["end_time"] = current_time + line_dur
                    current_time += line_dur
                    updated_script.append(line)
                    
            if all_audio:
                combined = np.concatenate(all_audio)
                sf.write(output_path, combined, sample_rate)
                return len(combined) / sample_rate, updated_script
            return 0.0, updated_script

        duration = await asyncio.to_thread(_run_synth)
        return duration

_instance = None

def get_podcast_generator() -> PodcastGenerator:
    global _instance
    if _instance is None:
        _instance = PodcastGenerator()
    return _instance
