"""
Quick verification script for DB, Gemini, and TTS.
Run from backend folder: python scripts/verify_setup.py
"""
from dotenv import load_dotenv

load_dotenv()


def main():
    print("=== RO Calling Agent setup check ===\n")

    # Database
    try:
        from sqlalchemy import create_engine, text
        import os

        url = os.getenv("DATABASE_URL")
        engine = create_engine(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("PostgreSQL: OK")
    except Exception as e:
        print(f"PostgreSQL: FAIL — {e}")
        print("  -> Fix DATABASE_URL in backend/.env (user, password, database ro_calling_agent)")

    # Gemini
    try:
        from ai_agent import get_opening_greeting

        r = get_opening_greeting()
        if "Priya" in r.get("response", "") and r.get("customer_intent") == "information_needed":
            # Fallback greeting when API fails looks similar — check for generic fallback phrase
            if "We help businesses get clean" in r.get("response", ""):
                print("Gemini API: WARN — using fallback greeting (check GEMINI_API_KEY)")
            else:
                print("Gemini API: OK")
        else:
            print("Gemini API: OK (response received)")
    except Exception as e:
        print(f"Gemini API: FAIL — {e}")

    # TTS
    try:
        from speech import get_tts_audio

        data = get_tts_audio("Test")
        ok = len(data.get("audio_base64", "")) > 100
        print(f"gTTS: {'OK' if ok else 'FAIL (empty audio)'}")
    except Exception as e:
        print(f"gTTS: FAIL — {e}")

    # Whisper STT (loads the model - first run downloads weights, may be slow)
    try:
        from speech import _get_whisper_model

        _get_whisper_model()
        print("Whisper STT: OK (model loaded)")
    except ImportError:
        print("Whisper STT: FAIL — faster-whisper not installed (pip install -r requirements.txt)")
    except Exception as e:
        print(f"Whisper STT: FAIL — {e}")

    print("\nDone.")


if __name__ == "__main__":
    main()
