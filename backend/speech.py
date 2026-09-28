import os
import io
import base64
import logging
import tempfile
import threading
from typing import Optional

from gtts import gTTS
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# Set STT_DEBUG_SAVE=true in .env to keep the last upload in ./debug_uploads
STT_DEBUG_SAVE = os.getenv("STT_DEBUG_SAVE", "false").lower() == "true"



# TEXT-TO-SPEECH


def text_to_speech_base64(text: str, language: str = "en") -> str:
    """Convert text to speech using gTTS and return base64 encoded audio."""
    if not text or not text.strip():
        logger.warning("TTS skipped: response text is empty")
        return ""

    try:
        tts = gTTS(text=text, lang=language, slow=False)

        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)

        audio_base64 = base64.b64encode(audio_buffer.read()).decode("utf-8")
        logger.info(
            "TTS generated MP3 audio (%d bytes)",
            len(audio_base64) * 3 // 4,
        )
        return audio_base64

    except Exception as e:
        logger.exception("TTS generation failed (%s)", type(e).__name__)
        return ""


def get_tts_audio(text: str) -> dict:
    """Get TTS audio for a given text."""
    audio_base64 = text_to_speech_base64(text)

    return {
        "audio_base64": audio_base64,
        "format": "mp3",
        "text": text,
    }


# SPEECH-TO-TEXT (local Whisper via faster-whisper)


_whisper_model = None
_whisper_lock = threading.Lock()


def _get_whisper_model():
    """Lazily create and cache the faster-whisper model (thread-safe)."""
    global _whisper_model

    if _whisper_model is None:
        with _whisper_lock:
            if _whisper_model is None:
                from faster_whisper import WhisperModel

                model_size = os.getenv("WHISPER_MODEL_SIZE", "base")
                device = os.getenv("WHISPER_DEVICE", "cpu")
                compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

                logger.info(
                    "Loading Whisper model '%s' (device=%s, compute_type=%s)...",
                    model_size, device, compute_type,
                )

                _whisper_model = WhisperModel(
                    model_size,
                    device=device,
                    compute_type=compute_type,
                )

                logger.info("Whisper model loaded")

    return _whisper_model


def _empty_transcription(reason: str = "") -> dict:
    """Return a safe empty STT result instead of crashing the API."""
    if reason:
        logger.warning("STT returning empty transcription: %s", reason)

    return {
        "text": "",
        "language": "en",
        "duration": 0.0,
    }


def _validate_audio_file(tmp_path: str, audio_size: int) -> dict:
    """
    Validate that the uploaded file contains a decodable audio stream
    with at least one frame.
    """
    if audio_size < 256:
        raise ValueError(
            f"Audio upload is too small to contain a valid recording ({audio_size} bytes)"
        )

    try:
        import av

        with av.open(tmp_path) as container:
            audio_stream = next(iter(container.streams.audio), None)

            if audio_stream is None:
                raise ValueError("Uploaded file contains no audio stream")

            codec = audio_stream.codec_context.name or "unknown"
            sample_rate = audio_stream.codec_context.sample_rate or "unknown"
            channels = audio_stream.codec_context.channels or "unknown"

            logger.info(
                "STT audio stream: codec=%s, sample_rate=%s Hz, channels=%s",
                codec, sample_rate, channels,
            )

            packet_count = 0
            frame_count = 0

            for packet in container.demux(audio_stream):
                packet_count += 1

                try:
                    for _frame in packet.decode():
                        frame_count += 1
                        break
                except Exception as decode_error:
                    raise ValueError(
                        f"Audio stream could not be decoded: {decode_error}"
                    ) from decode_error

                if frame_count >= 1:
                    break

            if packet_count == 0 or frame_count == 0:
                raise ValueError("Audio stream contains no decodable audio frames")

            return {
                "codec": codec,
                "sample_rate": sample_rate,
                "channels": channels,
                "packets": packet_count,
                "frames": frame_count,
            }

    except ValueError:
        raise
    except Exception as error:
        raise ValueError(f"Unable to inspect uploaded audio: {error}") from error


def _save_debug_copy(audio_bytes: bytes, suffix: str) -> None:
    """Keep the last upload so you can play it and hear what the server got."""
    try:
        os.makedirs("debug_uploads", exist_ok=True)
        path = os.path.join("debug_uploads", f"last_upload{suffix}")
        with open(path, "wb") as f:
            f.write(audio_bytes)
        logger.info("Saved debug copy of upload: %s", os.path.abspath(path))
    except OSError as e:
        logger.warning("Could not save debug copy: %s", e)


def transcribe_audio_bytes(
    audio_bytes: bytes,
    filename: Optional[str] = None,
) -> dict:
    """
    Transcribe raw audio bytes uploaded by the browser.

    Returns: {"text": str, "language": str, "duration": float}

    Invalid, empty, or silent recordings return an empty transcription
    rather than crashing the FastAPI endpoint.
    """
    if not audio_bytes:
        return _empty_transcription("audio upload is empty")

    if len(audio_bytes) < 256:
        return _empty_transcription(
            f"audio upload is too small ({len(audio_bytes)} bytes)"
        )

    suffix = os.path.splitext(filename or "")[1].lower() or ".webm"

    allowed_suffixes = {
        ".webm", ".ogg", ".opus", ".mp4", ".m4a",
        ".wav", ".mp3", ".mpeg", ".mpga",
    }
    if suffix not in allowed_suffixes:
        logger.warning(
            "Unknown audio extension '%s'; using .webm for decoder compatibility",
            suffix,
        )
        suffix = ".webm"

    if STT_DEBUG_SAVE:
        _save_debug_copy(audio_bytes, suffix)

    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp.flush()
            tmp_path = tmp.name

        logger.info(
            "STT audio received: format=%s, size=%d bytes",
            suffix.lstrip("."), len(audio_bytes),
        )

        _validate_audio_file(tmp_path, len(audio_bytes))

        model = _get_whisper_model()

        configured_language = os.getenv("WHISPER_LANGUAGE", "auto").strip()
        language = (
            None
            if not configured_language or configured_language.lower() == "auto"
            else configured_language
        )

        try:
            beam_size = max(1, int(os.getenv("WHISPER_BEAM_SIZE", "3")))
        except ValueError:
            beam_size = 3
            logger.warning("Invalid WHISPER_BEAM_SIZE; falling back to 3")

        try:
            vad_threshold = float(os.getenv("WHISPER_VAD_THRESHOLD", "0.3"))
        except ValueError:
            vad_threshold = 0.3

        logger.info(
            "Whisper transcription started (language=%s, beam_size=%d, vad_threshold=%.2f)",
            language or "auto", beam_size, vad_threshold,
        )

        try:
            segments, info = model.transcribe(
                tmp_path,
                language=language,
                beam_size=beam_size,
                condition_on_previous_text=False,
                vad_filter=True,
                vad_parameters={
                    "threshold": vad_threshold,   # lower = more sensitive
                    "min_silence_duration_ms": 500,
                    "speech_pad_ms": 400,
                },
            )

            # faster-whisper returns a lazy generator, so errors can
            # happen while iterating rather than in transcribe() itself.
            text_parts = []
            for segment in segments:
                segment_text = (segment.text or "").strip()
                if segment_text:
                    text_parts.append(segment_text)

            full_text = " ".join(text_parts).strip()

        except ValueError as error:
            # Older faster-whisper versions raise
            # "max() iterable argument is empty" when the VAD finds
            # no speech at all (silence or noise only).
            logger.warning(
                "No speech detected in this recording (%s: %s)",
                type(error).__name__, error,
            )
            return _empty_transcription("No speech detected in this recording")

        detected_language = (
            getattr(info, "language", None)
            or (
                configured_language
                if configured_language and configured_language.lower() != "auto"
                else "en"
            )
            or "en"
        )

        duration = float(getattr(info, "duration", 0.0) or 0.0)

        logger.info(
            "Whisper transcription %s: duration=%.2fs, language=%s, characters=%d",
            "completed" if full_text else "returned no speech",
            duration, detected_language, len(full_text),
        )

        return {
            "text": full_text,
            "language": detected_language,
            "duration": duration,
        }

    except ValueError as error:
        logger.warning("Invalid audio upload: %s", error)
        return _empty_transcription(str(error))

    except Exception as error:
        logger.exception(
            "Whisper transcription failed unexpectedly (%s)",
            type(error).__name__,
        )
        raise

    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                logger.warning(
                    "Could not remove temporary transcription audio file: %s",
                    tmp_path,
                )