import shutil
import subprocess
import tempfile
from pathlib import Path

from django.conf import settings


class TranscriptionError(RuntimeError):
    pass


def whisper_status():
    if not settings.WHISPER_ENABLED:
        return {"status": "disabled", "detail": "Local video transcription is not enabled."}
    cli = shutil.which(settings.WHISPER_CLI_PATH) or (settings.WHISPER_CLI_PATH if Path(settings.WHISPER_CLI_PATH).is_file() else "")
    ffmpeg = shutil.which(settings.FFMPEG_PATH) or (settings.FFMPEG_PATH if Path(settings.FFMPEG_PATH).is_file() else "")
    model = Path(settings.WHISPER_MODEL_PATH).expanduser()
    if not cli:
        return {"status": "misconfigured", "detail": "Whisper CLI was not found."}
    if not ffmpeg:
        return {"status": "misconfigured", "detail": "FFmpeg was not found."}
    if not model.is_file():
        return {"status": "misconfigured", "detail": "Whisper model file was not found."}
    return {"status": "configured", "detail": f"Local transcription is ready with {model.name}."}


def transcribe_video(content_import):
    state = whisper_status()
    if state["status"] != "configured":
        raise TranscriptionError(state["detail"])
    cli = shutil.which(settings.WHISPER_CLI_PATH) or settings.WHISPER_CLI_PATH
    ffmpeg = shutil.which(settings.FFMPEG_PATH) or settings.FFMPEG_PATH
    model = str(Path(settings.WHISPER_MODEL_PATH).expanduser())
    with tempfile.TemporaryDirectory(prefix="tala-whisper-") as directory:
        workdir = Path(directory)
        source = workdir / Path(content_import.original_filename).name
        with content_import.source_file.open("rb") as uploaded, source.open("wb") as destination:
            shutil.copyfileobj(uploaded, destination)
        audio = workdir / "audio.wav"
        output_base = workdir / "transcript"
        try:
            subprocess.run(
                [ffmpeg, "-nostdin", "-y", "-i", str(source), "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(audio)],
                check=True,
                capture_output=True,
                text=True,
                timeout=settings.WHISPER_TIMEOUT_SECONDS,
            )
            subprocess.run(
                [cli, "-m", model, "-f", str(audio), "-l", settings.WHISPER_LANGUAGE, "-otxt", "-of", str(output_base)],
                check=True,
                capture_output=True,
                text=True,
                timeout=settings.WHISPER_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired as exc:
            raise TranscriptionError("Local video transcription exceeded its configured time limit.") from exc
        except subprocess.CalledProcessError as exc:
            detail = (exc.stderr or exc.stdout or "Local transcription command failed.").strip().splitlines()[-1]
            raise TranscriptionError(detail[:500]) from exc
        transcript_path = output_base.with_suffix(".txt")
        if not transcript_path.is_file():
            raise TranscriptionError("Whisper completed without producing a transcript.")
        transcript = transcript_path.read_text(encoding="utf-8").replace("\x00", "").strip()
        if len(transcript) < 20:
            raise TranscriptionError("The video did not contain enough recognizable speech to create a transcript.")
        return transcript
