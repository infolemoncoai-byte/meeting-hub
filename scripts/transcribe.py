#!/usr/bin/env python3
"""Transcribe an audio file to plain text.

MSU2 plan:
- Use local faster-whisper (CPU) for a simple, single-file transcript.
- Output transcript text to stdout.

Setup (example):
  python3 -m pip install --upgrade pip
  python3 -m pip install faster-whisper

Notes:
- This is intentionally minimal; we'll add timestamps/segments later.
"""

import sys


def main() -> int:
  if len(sys.argv) != 2:
    print("usage: transcribe.py <audio_path>", file=sys.stderr)
    return 2

  audio_path = sys.argv[1]

  try:
    from faster_whisper import WhisperModel  # type: ignore
  except Exception as e:
    print("faster-whisper is not installed.", file=sys.stderr)
    print("Install with: python3 -m pip install faster-whisper", file=sys.stderr)
    print(f"import error: {e}", file=sys.stderr)
    return 3

  # A pragmatic default: small model to keep CPU time sane.
  # Can be changed later via env/config.
  model = WhisperModel("small", device="cpu", compute_type="int8")

  segments, _info = model.transcribe(audio_path, beam_size=5)

  parts = []
  for seg in segments:
    text = (seg.text or "").strip()
    if text:
      parts.append(text)

  sys.stdout.write("\n".join(parts) + "\n")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
