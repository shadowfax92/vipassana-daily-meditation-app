#!/usr/bin/env python3
"""
Extract chanting chunks from Morning Chantings files.
Supports two extraction modes:
  - from_beginning: For authentic intro chants (Namo Tassa, etc.)
  - best_fit: Finds optimal chunk anywhere in the file
"""

import json
import subprocess
import shutil
from pathlib import Path
from dataclasses import dataclass
from enum import Enum


class ExtractionMode(Enum):
    FROM_BEGINNING = "from_beginning"
    BEST_FIT = "best_fit"


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


def find_chunk_from_beginning(
    segments: list[dict],
    target: int,
    min_dur: int,
    max_dur: int
) -> tuple[float, float, float] | None:
    """
    Find consecutive segments starting from the BEGINNING.
    Use this for authentic intro chants (Namo Tassa, taking refuge, etc.)

    Returns (start, end, actual_duration) or None if not possible.
    """
    if not segments:
        return None

    start_time = segments[0]["start"]
    cumulative_duration = 0
    best_chunk = None
    best_diff = float('inf')

    for end_idx in range(len(segments)):
        seg = segments[end_idx]
        cumulative_duration += seg["duration"]

        if min_dur <= cumulative_duration <= max_dur:
            diff = abs(cumulative_duration - target)
            if diff < best_diff:
                best_diff = diff
                best_chunk = (start_time, seg["end"], cumulative_duration)

        if cumulative_duration > max_dur:
            break

    return best_chunk


def find_chunk_best_fit(
    segments: list[dict],
    target: int,
    min_dur: int,
    max_dur: int
) -> tuple[float, float, float] | None:
    """
    Find the best consecutive segment grouping ANYWHERE in the file.
    Optimizes for closest match to target duration.

    Returns (start, end, actual_duration) or None if not possible.
    """
    if not segments:
        return None

    best_chunk = None
    best_diff = float('inf')

    for start_idx in range(len(segments)):
        cumulative_duration = 0

        for end_idx in range(start_idx, len(segments)):
            seg = segments[end_idx]
            cumulative_duration += seg["duration"]

            if min_dur <= cumulative_duration <= max_dur:
                diff = abs(cumulative_duration - target)
                if diff < best_diff:
                    best_diff = diff
                    best_chunk = (
                        segments[start_idx]["start"],
                        segments[end_idx]["end"],
                        cumulative_duration
                    )

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
        "-y",
        "-i", str(input_file),
        "-ss", str(start_sec),
        "-t", str(duration),
        "-c:a", "libmp3lame",
        "-q:a", "2",
        str(output_file)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0


def extract_chunks(
    mode: ExtractionMode = ExtractionMode.FROM_BEGINNING,
    file_filter: str = "Morning_Chantings"
):
    """
    Main extraction function.

    Args:
        mode: FROM_BEGINNING for intro chants, BEST_FIT for optimal anywhere
        file_filter: String to filter source files (e.g., "Morning_Chantings", "Dohas")
    """
    base_dir = Path(__file__).parent.parent
    analysis_dir = Path(__file__).parent / "analysis"
    sample_dir = base_dir / "sample"
    output_dir = Path(__file__).parent / "chunks" / "chanting"

    # Clean and recreate output directory
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Select extraction function based on mode
    if mode == ExtractionMode.FROM_BEGINNING:
        find_chunk = find_chunk_from_beginning
        mode_desc = "from BEGINNING (authentic intro chants)"
    else:
        find_chunk = find_chunk_best_fit
        mode_desc = "BEST FIT (optimal duration anywhere)"

    print("Loading segment analysis...")
    segments_by_file = load_segments(analysis_dir)

    # Filter files
    filtered_files = {
        k: v for k, v in segments_by_file.items()
        if file_filter in k
    }

    print(f"Found {len(filtered_files)} files matching '{file_filter}'")
    print(f"Extraction mode: {mode_desc}\n")

    metadata = {
        "2min": [],
        "5min": [],
        "10min": []
    }

    for file_key, data in sorted(filtered_files.items()):
        print(f"Processing: {file_key}")

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
            chunk_result = find_chunk(
                segments,
                config.target_seconds,
                config.min_seconds,
                config.max_seconds
            )

            if chunk_result:
                start, end, duration = chunk_result

                day_part = file_key.split("_")[0]
                output_name = f"{day_part}_Morning_{config.name}.mp3"
                output_file = output_dir / output_name

                print(f"  {config.name}: {start:.1f}s - {end:.1f}s ({duration:.1f}s = {duration/60:.1f} min)")

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
        "chanting": metadata,
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


def main():
    # Default: extract from beginning for authentic intro chants
    extract_chunks(
        mode=ExtractionMode.FROM_BEGINNING,
        file_filter="Morning_Chantings"
    )


if __name__ == "__main__":
    main()
