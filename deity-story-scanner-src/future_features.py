"""Optional additive features for deity music and Gayatri Mantra interaction."""

import json
import re
import subprocess
import uuid
import wave
from pathlib import Path

from flask import jsonify, request, send_file
from google.genai import types


LANGUAGE_NAMES = {"Tamil", "English", "Hindi", "Telugu", "Malayalam", "Kannada"}

# These are intentionally conservative aliases. The frontend sends the spoken
# transcript, and Gemini can handle regional-language variants when available.
MANTRA_HINTS = {
    "gayatri", "savitur", "bhargo", "devasya", "dhimahi", "prachodayat",
    "காயத்ரி", "தத்", "சவிதுர்", "பர்கோ", "தீமஹி", "ப்ரசோதயாத்",
    "गायत्री", "सवितुर", "भर्गो", "धीमहि", "प्रचोदयात्",
    "ఓం", "గాయత్రీ", "సవితుర్", "భర్గో", "ధీమహి", "ప్రచోదయాత్",
    "ഓം", "ഗായത്രി", "സവിതുർ", "ഭർഗോ", "ധീമഹി", "പ്രചോദയാത്",
    "ಓಂ", "ಗಾಯತ್ರಿ", "ಸವಿತುರ", "ಭರ್ಗೋ", "ಧೀಮಹಿ", "ಪ್ರಚೋದಯಾತ್",
}


def _clean(value):
    return " ".join(str(value or "").strip().split())


def _language(value):
    return value if value in LANGUAGE_NAMES else "Tamil"


def _fallback_verification(transcript):
    normalized = _clean(transcript).lower()
    words = set(re.findall(r"[\w\u0900-\u0dff\u0b80-\u0bff\u0c00-\u0c7f\u0d80-\u0dff]+", normalized))
    matches = len(words.intersection({hint.lower() for hint in MANTRA_HINTS}))
    return matches >= 2 or ("om" in words and matches >= 1)


def register_future_features(app, generate_with_fallback, gemini_client=None):
    @app.post("/speech-audio")
    def speech_audio():
        payload = request.get_json(silent=True) or {}
        text = _clean(payload.get("text"))[:12000]
        language = _language(payload.get("language"))
        gender = "female" if str(payload.get("gender", "male")).lower() == "female" else "male"
        if not text:
            return jsonify({"success": False, "error": "No speech text was provided."}), 400
        voice_codes = {"Tamil": "ta", "English": "en", "Hindi": "hi", "Telugu": "te", "Malayalam": "ml", "Kannada": "kn"}
        language_codes = {"Tamil": "ta-IN", "English": "en-IN", "Hindi": "hi-IN", "Telugu": "te-IN", "Malayalam": "ml-IN", "Kannada": "kn-IN"}
        voice = f"{voice_codes[language]}+{'f3' if gender == 'female' else 'm1'}"
        pitch = "55" if gender == "female" else "30"
        output_dir = Path(app.static_folder) / "generated"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"speech-{uuid.uuid4().hex}.wav"
        try:
            edge_voices = {
                "Tamil": {"female": "ta-IN-PallaviNeural", "male": "ta-IN-ValluvarNeural"},
                "English": {"female": "en-IN-NeerjaNeural", "male": "en-IN-PrabhatNeural"},
                "Hindi": {"female": "hi-IN-SwaraNeural", "male": "hi-IN-MadhurNeural"},
                "Telugu": {"female": "te-IN-ShrutiNeural", "male": "te-IN-MohanNeural"},
                "Malayalam": {"female": "ml-IN-SobhanaNeural", "male": "ml-IN-MidhunNeural"},
                "Kannada": {"female": "kn-IN-SapnaNeural", "male": "kn-IN-GaganNeural"},
            }
            edge_audio_path = output_dir / f"speech-{uuid.uuid4().hex}.mp3"
            try:
                import asyncio
                import edge_tts

                edge_voice = edge_voices[language][gender]
                voice_pitch = "-4Hz" if gender == "male" else "+1Hz"
                asyncio.run(edge_tts.Communicate(text, edge_voice, rate="-5%", pitch=voice_pitch).save(str(edge_audio_path)))
                if edge_audio_path.is_file() and edge_audio_path.stat().st_size > 1024:
                    return send_file(edge_audio_path, mimetype="audio/mpeg", max_age=0)
            except Exception:
                edge_audio_path.unlink(missing_ok=True)

            if gemini_client is not None:
                try:
                    tts_voice = "Kore" if gender == "female" else "Fenrir"
                    tts_config = types.GenerateContentConfig(
                        response_modalities=["AUDIO"],
                        speech_config=types.SpeechConfig(
                            language_code=language_codes[language],
                            voice_config=types.VoiceConfig(
                                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=tts_voice)
                            )
                        ),
                    )
                    response = gemini_client.models.generate_content(model="gemini-3.8-flash-tts", contents=text, config=tts_config)
                    audio_data = next((part.inline_data.data for part in response.candidates[0].content.parts if part.inline_data and part.inline_data.data), None)
                    if audio_data:
                        with wave.open(str(output_path), "wb") as wav_file:
                            wav_file.setnchannels(1)
                            wav_file.setsampwidth(2)
                            wav_file.setframerate(24000)
                            wav_file.writeframes(audio_data)
                        return send_file(output_path, mimetype="audio/wav", max_age=0)
                except Exception:
                    pass
            subprocess.run(["espeak-ng", "-v", voice, "-s", "145", "-p", pitch, "-g", "0", "-a", "200", "-w", str(output_path), text], check=True, timeout=30, capture_output=True)
            return send_file(output_path, mimetype="audio/wav", max_age=0)
        except Exception as error:
            output_path.unlink(missing_ok=True)
            return jsonify({"success": False, "error": f"Speech audio could not be generated: {error}"}), 500

    @app.post("/verify-mantra")
    def verify_mantra():
        payload = request.get_json(silent=True) or {}
        transcript = _clean(payload.get("transcript"))
        deity = _clean(payload.get("deity")) or "the deity"
        language = _language(payload.get("language"))

        if len(transcript) < 3:
            return jsonify({"success": True, "recognized": False, "message": "I could not hear the mantra clearly. Please try once more."})

        recognized = _fallback_verification(transcript)
        if not recognized:
            prompt = f"""
You are validating a devotional voice interaction. Determine whether this transcript is a sincere attempt to recite the Hindu Gayatri Mantra, even if pronunciation, transliteration, or language is imperfect.
Return ONLY valid JSON with exactly these keys: recognized (boolean), response (string).
If recognized is true, response must be a warm, short encouragement in {language} meaning: Wow, very good. You have recited the Gayatri Mantra beautifully. Now receive the blessing of {deity}.
If recognized is false, response must be a gentle, short request in {language} to try the Gayatri Mantra again.
Transcript: {transcript}
"""
            try:
                result = generate_with_fallback(prompt)
                raw = _clean(getattr(result, "text", ""))
                if raw.startswith("```"):
                    raw = raw.strip("`")
                    if raw.startswith("json"):
                        raw = raw[4:]
                model_result = json.loads(raw.strip())
                recognized = bool(model_result.get("recognized"))
                response_text = _clean(model_result.get("response"))
            except Exception:
                response_text = "Wow, very good. Please continue with devotion." if recognized else "I could not recognize the mantra clearly. Please try again."
        else:
            response_text = "Wow, very good. You have recited the Gayatri Mantra beautifully. Now receive the blessing."

        return jsonify({
            "success": True,
            "recognized": recognized,
            "message": response_text,
            "deity": deity,
            "language": language,
        })

    return app
