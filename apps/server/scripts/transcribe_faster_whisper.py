import argparse
import json
import os
import sys
import time
from faster_whisper import WhisperModel


def resolve_auto_device():
    """Resolve device for auto mode without requiring torch."""
    try:
        import ctranslate2

        if (
            hasattr(ctranslate2, "get_cuda_device_count")
            and ctranslate2.get_cuda_device_count() > 0
        ):
            return "cuda", "ctranslate2"
    except Exception:
        pass

    try:
        torch = __import__("torch")
        if torch.cuda.is_available():
            return "cuda", "torch"
    except Exception:
        pass

    return "cpu", "fallback"


def format_timestamp(seconds):
    return seconds


def main():
    parser = argparse.ArgumentParser(
        description="Transcribe audio using faster-whisper"
    )
    parser.add_argument("audio_path", help="Path to the input audio file")
    parser.add_argument(
        "--model",
        default="base",
        help="Model size or path (tiny, base, small, medium, large-v2, etc.)",
    )
    parser.add_argument(
        "--device", default="auto", help="Device to use (cuda, cpu, auto)"
    )
    parser.add_argument(
        "--compute_type",
        default="default",
        help="Compute type (float16, int8_float16, int8, float32)",
    )
    parser.add_argument("--language", help="Language code (e.g., en, zh)")
    parser.add_argument(
        "--beam_size", type=int, default=5, help="Beam size for decoding"
    )
    parser.add_argument(
        "--temperature", type=float, default=0.0, help="Temperature for sampling"
    )
    parser.add_argument(
        "--output_dir", required=True, help="Directory to save the output JSON"
    )
    parser.add_argument(
        "--verbose", action="store_true", help="Print progress to stderr"
    )

    args = parser.parse_args()

    # Determine device
    device = args.device
    auto_source = ""
    if device == "auto":
        device, auto_source = resolve_auto_device()

    if args.verbose:
        if auto_source:
            print(
                f"Auto device resolved to '{device}' via {auto_source}", file=sys.stderr
            )
        print(
            f"Loading model '{args.model}' on {device} with compute_type '{args.compute_type}'...",
            file=sys.stderr,
        )

    try:
        model = WhisperModel(args.model, device=device, compute_type=args.compute_type)
    except Exception as e:
        print(f"Error loading model: {e}", file=sys.stderr)
        sys.exit(1)

    if args.verbose:
        print(f"Transcribing '{args.audio_path}'...", file=sys.stderr)

    try:
        segments, info = model.transcribe(
            args.audio_path,
            beam_size=args.beam_size,
            language=args.language,
            temperature=args.temperature,
            vad_filter=True,  # Enable VAD by default for better results
            vad_parameters=dict(min_silence_duration_ms=500),
        )

        # faster-whisper returns a generator, so we need to iterate over it
        results = []
        text_content = []

        start_time = time.time()
        for i, segment in enumerate(segments):
            segment_dict = {
                "id": i,
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
            }
            results.append(segment_dict)
            text_content.append(segment.text.strip())

            if args.verbose:
                # Print progress every few seconds or segments if needed,
                # but for now just print to stderr to avoid messing up stdout if we were using it
                # formatted_time = f"[{format_timestamp(segment.start)} --> {format_timestamp(segment.end)}]"
                # print(f"{formatted_time} {segment.text}", file=sys.stderr)
                pass

        final_json = {
            "text": " ".join(text_content),
            "segments": results,
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
        }

        # Save to JSON
        filename = os.path.basename(args.audio_path)
        name, _ = os.path.splitext(filename)
        output_json_path = os.path.join(args.output_dir, f"{name}.json")

        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(final_json, f, ensure_ascii=False, indent=2)

        if args.verbose:
            print(
                f"Transcription complete. Saved to {output_json_path}", file=sys.stderr
            )
            print(f"Total time: {time.time() - start_time:.2f}s", file=sys.stderr)

        # Also print the JSON path to stdout so the caller can easily find it
        print(output_json_path)

    except Exception as e:
        print(f"Error during transcription: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
