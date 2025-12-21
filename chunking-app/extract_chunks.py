#!/usr/bin/env python3
"""
Extract intro chunks from Morning Chantings files.
Groups consecutive segments to create ~2min, ~5min, ~10min chunks.
Cuts only at natural silence boundaries.
"""

import json
import subprocess
from pathlib import Path
from dataclasses import dataclass


@dataclass
class ChunkConfig:
    name: str
    target_seconds: int
    min_seconds: int
    max_seconds: int


CHUNK_CONFIGS = [
    ChunkConfig("2min", 120, 90, 180),    # 1.5 - 3 min
    ChunkConfig("5min", 300, 240, 420),   # 4 - 7 min
    ChunkConfig("10min", 600, 480, 720),  # 8 - 12 min
]


def load_segments(analysis_dir: Path) -> dict:
    """Load all segment data from analysis JSON files."""
    segments_by_file = {}

    for json_file in analysis_dir.glob("*_segments.json"):
        if json_file.name == "all_segments.json":
            continue
        with open(json_file) as f:
            data = json.load(f)
            segments_by_file[data["file"]] = data

    return segments_by_file


def find_best_chunk(segments: list[dict], target: int, min_dur: int, max_dur: int) -> tuple[float, float, float] | None:
    """
    Find the best consecutive segment grouping for target duration.
    Returns (start, end, actual_duration) or None if not possible.
    """
    if not segments:
        return None

    best_chunk = None
    best_diff = float('inf')

    # Try starting from each segment
    for start_idx in range(len(segments)):
        cumulative_duration = 0

        for end_idx in range(start_idx, len(segments)):
            seg = segments[end_idx]
            cumulative_duration += seg["duration"]

            # Check if this grouping is within acceptable range
            if min_dur <= cumulative_duration <= max_dur:
                diff = abs(cumulative_duration - target)
                if diff < best_diff:
                    best_diff = diff
                    best_chunk = (
                        segments[start_idx]["start"],
                        segments[end_idx]["end"],
                        cumulative_duration
                    )

            # Stop if we've exceeded max duration
            if cumulative_duration > max_dur:
                break

    return best_chunk


def extract_audio_chunk(
    input_file: Path,
    output_file: Path,
    start_sec: float,
    end_sec: float
) -> bool:
    """Extract a chunk from audio file using ffmpeg."""
    duration = end_sec - start_sec

    cmd = [
        "ffmpeg",
        "-y",  # Overwrite output
        "-i", str(input_file),
        "-ss", str(start_sec),
        "-t", str(duration),
        "-c:a", "libmp3lame",
        "-q:a", "2",  # High quality VBR
        str(output_file)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0


def main():
    base_dir = Path(__file__).parent.parent
    analysis_dir = Path(__file__).parent / "analysis"
    sample_dir = base_dir / "sample"
    output_dir = Path(__file__).parent / "chunks" / "intro"

    output_dir.mkdir(parents=True, exist_ok=True)

    # Load segment analysis
    print("Loading segment analysis...")
    segments_by_file = load_segments(analysis_dir)

    # Filter to Morning Chantings only
    morning_files = {
        k: v for k, v in segments_by_file.items()
        if "Morning_Chantings" in k
    }

    print(f"Found {len(morning_files)} Morning Chantings files")

    # Track all generated chunks for metadata
    metadata = {
        "2min": [],
        "5min": [],
        "10min": []
    }

    for file_key, data in sorted(morning_files.items()):
        print(f"\nProcessing: {file_key}")

        # Find source audio file
        source_file = None
        for ext in [".mp3", ".wav", ".m4a", ".webm"]:
            candidate = sample_dir / f"{file_key}{ext}"
            if candidate.exists():
                source_file = candidate
                break

        if not source_file:
            print(f"  WARNING: Source file not found, skipping")
            continue

        segments = data["segments"]

        for config in CHUNK_CONFIGS:
            chunk_result = find_best_chunk(
                segments,
                config.target_seconds,
                config.min_seconds,
                config.max_seconds
            )

            if chunk_result:
                start, end, duration = chunk_result

                # Create output filename
                # e.g., Day01_Morning_2min.mp3
                day_part = file_key.split("_")[0]  # "Day01"
                output_name = f"{day_part}_Morning_{config.name}.mp3"
                output_file = output_dir / output_name

                print(f"  {config.name}: {start:.1f}s - {end:.1f}s ({duration:.1f}s actual)")

                success = extract_audio_chunk(source_file, output_file, start, end)

                if success:
                    metadata[config.name].append({
                        "file": output_name,
                        "source": file_key,
                        "start": start,
                        "end": end,
                        "duration": duration
                    })
                    print(f"    ✓ Created {output_name}")
                else:
                    print(f"    ✗ Failed to create {output_name}")
            else:
                print(f"  {config.name}: No suitable segment grouping found")

    # Save metadata
    metadata_file = Path(__file__).parent / "chunks" / "metadata.json"

    full_metadata = {
        "intros": metadata,
        "outro": "outro.webm",
        "gong": "gong.mp3"
    }

    with open(metadata_file, "w") as f:
        json.dump(full_metadata, f, indent=2)

    print(f"\n{'='*50}")
    print("Chunk generation complete!")
    print(f"  2min chunks: {len(metadata['2min'])}")
    print(f"  5min chunks: {len(metadata['5min'])}")
    print(f"  10min chunks: {len(metadata['10min'])}")
    print(f"\nMetadata saved to: {metadata_file}")


if __name__ == "__main__":
    main()
