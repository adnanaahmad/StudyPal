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
1. Output MUST be valid JSON containing a single array of dialogue objects.
2. Each dialogue object MUST have exactly these keys: "speaker" (either "Sarah" or "Alex"), and "text" (the spoken line).
3. Keep the conversation dynamic, debate-style, and engaging. Avoid overly long monologues (max 3-4 sentences per turn).
4. CRITICAL: Provide a COMPREHENSIVE and IN-DEPTH discussion. The script MUST contain AT LEAST 15 to 25 dialogue turns back and forth. Do NOT just write an intro; write the full podcast episode exploring the nuances of the topic.
5. Do not include markdown formatting or extra text outside the JSON array.

EXAMPLE OUTPUT:
[
  {"speaker": "Sarah", "text": "Welcome to the Audio Overview! Today we're diving into Quantum Mechanics."},
  {"speaker": "Alex", "text": "That's right, Sarah. And it's not just theory—it changes how we see reality itself."}
]
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
                max_tokens=2048,
                response_format={"type": "json_object"} if hasattr(llm_client, "is_openai") else None
            )
            
            # Clean and parse JSON
            raw_script = raw_script.strip()
            if raw_script.startswith("```json"):
                raw_script = raw_script[7:-3].strip()
            elif raw_script.startswith("```"):
                raw_script = raw_script[3:-3].strip()
                
            script = json.loads(raw_script)
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
            # MOCK SYNTHESIS: Generate a fake blank WAV file if Kokoro fails
            logger.info("Using mock audio synthesis.")
            import wave
            import struct
            with wave.open(output_path, 'w') as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(24000)
                # 5 seconds of silence
                for _ in range(24000 * 5):
                    wav_file.writeframes(struct.pack('h', 0))
                    
            for idx, line in enumerate(script):
                line["timestamp"] = idx * (5.0 / max(len(script), 1))
                line["end_time"] = (idx + 1) * (5.0 / max(len(script), 1))
                
            return 5.0, script
            
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
                speaker = line.get("speaker", "Sarah")
                text = line.get("text", "")
                if not text:
                    continue
                    
                voice = voices.get(speaker, "af_bella")
                
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
