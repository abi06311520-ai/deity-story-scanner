import os
import random
import time
import traceback
from io import BytesIO

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from google import genai
from google.genai import types
from future_features import register_future_features

load_dotenv(override=True)

MODEL_NAMES = [
    "gemini-3-flash-preview",
    "gemini-3.5-flash",
    "gemini-2.5-flash",
]
MAX_RETRIES_PER_MODEL = 2
LANGUAGE_NAMES = {"Tamil", "English", "Hindi", "Telugu", "Malayalam", "Kannada"}

gemini_api_key = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=gemini_api_key) if gemini_api_key else None
FAST_SCAN_CONFIG = types.GenerateContentConfig(
    thinking_config=types.ThinkingConfig(thinking_budget=0),
    response_mime_type="application/json",
)

app = Flask(__name__)


def clean_text(value):
    return (value or "").strip()


def clean_deity_name(value):
    value = clean_text(value).replace("**", "").replace("\n", " ")
    return " ".join(value.split())


def is_temporary_error(error):
    text = str(error).upper()
    return any(token in text for token in ("503", "UNAVAILABLE", "HIGH DEMAND", "OVERLOADED", "429", "RESOURCE_EXHAUSTED", "RATE LIMIT", "TOO MANY REQUESTS"))


def generate_with_fallback(contents, config=None):
    if gemini_client is None:
        raise RuntimeError("GEMINI_API_KEY was not found. Check your .env file.")
    last_error = None
    for model_name in MODEL_NAMES:
        for attempt in range(1, MAX_RETRIES_PER_MODEL + 1):
            try:
                return gemini_client.models.generate_content(model=model_name, contents=contents, config=config)
            except Exception as error:
                last_error = error
                if not is_temporary_error(error):
                    break # Break retry loop if it's not temporary
                # A 429 quota limit is unlikely to clear after a one-second wait;
                # move to the next model. Brief 503 overloads get one retry.
                error_text = str(error).upper()
                if not any(token in error_text for token in ("503", "UNAVAILABLE", "HIGH DEMAND", "OVERLOADED")):
                    break
                if attempt < MAX_RETRIES_PER_MODEL:
                    time.sleep(2 ** (attempt - 1) + random.uniform(0.4, 1.2))
    raise last_error or RuntimeError("All Gemini models failed.")


def language_or_default(value):
    return value if value in LANGUAGE_NAMES else "Tamil"


def parse_story_payload(raw_text):
    """Accept JSON when the model follows the format, with a safe text fallback."""
    text = clean_text(raw_text)
    
    # Try parsing JSON first
    try:
        import json
        
        # Remove any potential markdown block backticks around JSON
        cleaned_for_json = text
        if cleaned_for_json.startswith("```json"):
            cleaned_for_json = cleaned_for_json[7:]
        elif cleaned_for_json.startswith("```"):
            cleaned_for_json = cleaned_for_json[3:]
        if cleaned_for_json.endswith("```"):
            cleaned_for_json = cleaned_for_json[:-3]
            
        payload = json.loads(cleaned_for_json.strip())
        
        # Determine if it's the combined output or just story
        deity = clean_deity_name(payload.get("deity", ""))
        gender = clean_text(payload.get("gender")).lower()
        if gender not in {"male", "female"}:
            gender = ""
        story = clean_text(payload.get("story"))
        conclusion = clean_text(payload.get("conclusion"))
        
        if story and conclusion:
            return deity, story, conclusion, gender
    except Exception:
        pass
        
    return "", text, "May the wisdom of this sacred presence guide every step with courage and compassion.", ""


def combined_prompt(language):
    return f"""
Identify the Hindu god or goddess shown in the image.
If it is a Hindu deity, create a respectful, devotional narration for a family-friendly sacred statue experience.
Write the story and conclusion completely in {language}. Use the correct native script for that language.
Return ONLY valid JSON with exactly these four string keys: deity, gender, story, and conclusion. Do not use markdown backticks.
Requirements for deity:
- Return only one simple deity name in English. If unclear, return exactly Unknown.
- Set gender to exactly male or female to match the identified deity's traditional gender. If the deity is Unknown or genuinely cannot be classified, use unknown.
Requirements for story:
- 75 to 105 words.
- Begin naturally with the deity's name.
- Tell one clear, popular story or explain the deity's importance.
- Sound as if the deity is speaking directly in first person, with warmth and dignity.
- Use simple, natural spoken {language} that a child and an adult can understand.
- Use short sentences, common everyday words, and clear pronunciation-friendly wording.
- Avoid poetic or archaic vocabulary, long compound words, unnecessary Sanskrit, and English words.
- Do not mention AI, camera, scanning, prompts, or technology.
Requirements for conclusion:
- 18 to 28 words.
- A memorable first-person blessing or lesson spoken by the deity.
- Use simple, natural spoken {language}.
- Do not use markdown or labels inside either value.
"""


def translate_prompt(deity_name, story, conclusion, language):
    return f"""
Translate this sacred first-person narration into simple, natural spoken {language}, using the correct native script.
Return ONLY valid JSON with exactly these two string keys: story and conclusion. Do not use markdown backticks.
Keep the meaning, warmth, devotional respect, first-person deity voice, and similar length.
Use short sentences and common everyday words that are easy to understand when spoken aloud.
Avoid literal, awkward, poetic, archaic, or machine-like translation. Do not add explanations, labels, markdown, or English unless {language} requires it.
Deity: {deity_name}
Current story: {story}
Current conclusion: {conclusion}
"""


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/test-gemini", methods=["GET"])
def test_gemini():
    try:
        response = generate_with_fallback("Reply with only the word OK.")
        return jsonify({"success": True, "response": clean_text(response.text)})
    except Exception as error:
        traceback.print_exc()
        return jsonify({"success": False, "error": f"{type(error).__name__}: {error}"}), 500


def validate_image_request():
    if "image" not in request.files:
        return None, (jsonify({"success": False, "error": "No camera image received. Start the camera and scan again."}), 400)
    image_file = request.files["image"]
    image_bytes = image_file.read()
    if not image_bytes:
        return None, (jsonify({"success": False, "error": "The captured camera image is empty."}), 400)
    if len(image_bytes) > 19 * 1024 * 1024:
        return None, (jsonify({"success": False, "error": "The image is too large. Please scan again."}), 400)
    try:
        from PIL import Image
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        image.thumbnail((640, 640), Image.Resampling.LANCZOS)
        compressed = BytesIO()
        image.save(compressed, format="JPEG", quality=65, optimize=True)
        image_bytes = compressed.getvalue()
        mime_type = "image/jpeg"
    except Exception:
        mime_type = image_file.mimetype if image_file.mimetype in {"image/jpeg", "image/png", "image/webp", "image.heic", "image.heif"} else "image/jpeg"
    return types.Part.from_bytes(data=image_bytes, mime_type=mime_type), None


@app.route("/scan", methods=["POST"])
def scan_statue():
    try:
        image_part, error_response = validate_image_request()
        if error_response:
            return error_response
        language = language_or_default(request.form.get("language"))
        
        response = generate_with_fallback([
            image_part,
            combined_prompt(language)
        ], config=FAST_SCAN_CONFIG)
        
        deity_name, story, conclusion, gender = parse_story_payload(response.text)
        
        if not deity_name or deity_name.lower() == "unknown":
            return jsonify({"success": False, "error": "The statue could not be identified. Show it clearly and scan again."}), 400
        if not story:
            return jsonify({"success": False, "error": "Gemini returned an empty story."}), 500
            
        return jsonify({"success": True, "deity": deity_name, "gender": gender, "language": language, "story": story, "conclusion": conclusion})
    except Exception as error:
        traceback.print_exc()
        if is_temporary_error(error):
            return jsonify({"success": False, "error": "The story service is temporarily busy. Please scan again in a moment."}), 503
        return jsonify({"success": False, "error": f"{type(error).__name__}: {error}"}), 500


@app.route("/translate", methods=["POST"])
def translate_story():
    try:
        payload = request.get_json(silent=True) or {}
        deity_name = clean_deity_name(payload.get("deity"))
        story = clean_text(payload.get("story"))
        conclusion = clean_text(payload.get("conclusion"))
        gender = str(payload.get("gender", "")).lower()
        if gender not in {"male", "female"}:
            gender = ""
        language = language_or_default(payload.get("language"))
        if not deity_name or not story:
            return jsonify({"success": False, "error": "There is no story to translate yet."}), 400
        response = generate_with_fallback(translate_prompt(deity_name, story, conclusion, language), config=FAST_SCAN_CONFIG)
        _, translated_story, translated_conclusion, _ = parse_story_payload(response.text)
        return jsonify({"success": True, "deity": deity_name, "gender": gender, "language": language, "story": translated_story, "conclusion": translated_conclusion})
    except Exception as error:
        traceback.print_exc()
        if is_temporary_error(error):
            return jsonify({"success": False, "error": "The translation service is temporarily busy. Please try changing language again shortly."}), 503
        return jsonify({"success": False, "error": f"{type(error).__name__}: {error}"}), 500


register_future_features(app, generate_with_fallback, gemini_client)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
