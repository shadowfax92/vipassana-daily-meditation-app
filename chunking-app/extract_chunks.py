#!/usr/bin/env python3
"""
Extract chanting chunks from Vipassana audio files.

Uses BEST_FIT_SAFE algorithm:
- Finds optimal chunks anywhere in the file
- Won't start chunks in the last 5 minutes (avoids closing mantras)
- Extracts multiple non-overlapping chunks per duration
"""

import json
import subprocess
import shutil
import re
from pathlib import Path
from dataclasses import dataclass


@dataclass
class ChunkConfig:
    name: str
    target_seconds: int
    min_seconds: int
    max_seconds: int


@dataclass
class ExtractedChunk:
    start: float
    end: float
    duration: float
    diff: float  # difference from target


CHUNK_CONFIGS = [
    ChunkConfig("2min", 120, 90, 180),    # 1.5 - 3 min
    ChunkConfig("5min", 300, 240, 420),   # 4 - 7 min
    ChunkConfig("10min", 600, 480, 720),  # 8 - 12 min
]

EXTRACT_CONFIG = {
    "exclude_last_seconds": 300,  # 5 minutes - where closing mantras typically are
    "max_chunks_per_duration": 10,
    "include_filters": ["Morning_Chantings", "Special_Chantings"],
    "exclude_filters": ["Dohas"],
}


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


def find_multiple_chunks_safe(
    segments: list[dict],
    target: int,
    min_dur: int,
    max_dur: int,
    exclude_last_seconds: int = 300,
    max_chunks: int = 10
) -> list[ExtractedChunk]:
    """
    Find multiple non-overlapping chunks using BEST_FIT_SAFE algorithm.

    - Finds all possible chunks that fit the target duration
    - Excludes any chunk that STARTS in the last N seconds (avoids closing mantras)
    - Sorts by closest to target duration
    - Greedily selects non-overlapping chunks
    - Returns sorted by start time
    """
    if not segments:
        return []

    total_duration = segments[-1]["end"]
    cutoff_time = total_duration - exclude_last_seconds

    # If file is too short, adjust cutoff (use at least 50% of file)
    min_cutoff = total_duration * 0.5
    if cutoff_time < min_cutoff:
        cutoff_time = min_cutoff

    # Find all possible chunks
    all_possible: list[ExtractedChunk] = []

    for start_idx in range(len(segments)):
        # Don't start a chunk past the cutoff
        if segments[start_idx]["start"] >= cutoff_time:
            break

        cumulative_duration = 0

        for end_idx in range(start_idx, len(segments)):
            seg = segments[end_idx]
            cumulative_duration += seg["duration"]

            if min_dur <= cumulative_duration <= max_dur:
                diff = abs(cumulative_duration - target)
                all_possible.append(ExtractedChunk(
                    start=segments[start_idx]["start"],
                    end=segments[end_idx]["end"],
                    duration=cumulative_duration,
                    diff=diff
                ))

            if cumulative_duration > max_dur:
                break

    # Sort by how close to target (best first)
    all_possible.sort(key=lambda x: x.diff)

    # Greedily select non-overlapping chunks
    selected: list[ExtractedChunk] = []
    used_ranges: list[tuple[float, float]] = []

    for chunk in all_possible:
        if len(selected) >= max_chunks:
            break

        # Check if this chunk overlaps with any selected chunk
        overlaps = False
        for used_start, used_end in used_ranges:
            # Overlap if NOT (chunk ends before used starts OR chunk starts after used ends)
            if not (chunk.end <= used_start or chunk.start >= used_end):
                overlaps = True
                break

        if not overlaps:
            selected.append(chunk)
            used_ranges.append((chunk.start, chunk.end))

    # Sort by start time for consistent ordering
    selected.sort(key=lambda x: x.start)

    return selected


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


def extract_day_number(file_key: str) -> str:
    """
    Extract day identifier from file name.

    Examples:
        "Day01_Morning_Chantings_Chanting_10day" -> "day01"
        "Day10_Morning_Chantings_Chanting_10day" -> "day10"
        "Special_Chantings_Chanting_Various (1)" -> "sp01"
        "Special_Chantings_Chanting_Various_1985 (1)" -> "sp1985_01"
        "Special_Chantings_Chanting_Various" -> "sp00"
    """
    # Try to match "Day" followed by number
    match = re.search(r'Day(\d+)', file_key, re.IGNORECASE)
    if match:
        day_num = int(match.group(1))
        return f"day{day_num:02d}"

    # Check for special chanting
    if "special" in file_key.lower():
        # Check for _1985 style suffix first (more specific)
        year_match = re.search(r'_(\d{4})', file_key)
        paren_match = re.search(r'\((\d+)\)', file_key)

        if year_match and paren_match:
            # Both year and number: sp1985_01
            return f"sp{year_match.group(1)}_{int(paren_match.group(1)):02d}"
        elif year_match:
            # Just year: sp1985
            return f"sp{year_match.group(1)}"
        elif paren_match:
            # Just number: sp01
            return f"sp{int(paren_match.group(1)):02d}"
        else:
            return "sp00"

    # Fallback: use first part of filename
    first_part = file_key.split("_")[0].lower()
    return first_part


def should_process_file(file_key: str, include_filters: list[str], exclude_filters: list[str]) -> bool:
    """Check if file should be processed based on filters."""
    # Check exclusions first
    for exclude in exclude_filters:
        if exclude.lower() in file_key.lower():
            return False

    # Check inclusions
    for include in include_filters:
        if include.lower() in file_key.lower():
            return True

    return False


def find_source_file(base_dir: Path, file_key: str) -> Path | None:
    """Find source audio file in the directory structure."""
    # Define source directories to search
    source_dirs = [
        base_dir / "full-audio-chantings" / "10-days",
        base_dir / "full-audio-chantings" / "special",
        base_dir / "full-audio-chantings",
        base_dir / "sample",  # fallback
    ]

    for source_dir in source_dirs:
        if not source_dir.exists():
            continue
        for ext in [".mp3", ".wav", ".m4a", ".webm"]:
            candidate = source_dir / f"{file_key}{ext}"
            if candidate.exists():
                return candidate

    return None


def get_duration(data: dict) -> float:
    """Get duration from segment data, handling different key names."""
    if "total_duration" in data:
        return data["total_duration"]
    elif "duration_seconds" in data:
        return data["duration_seconds"]
    elif "segments" in data and data["segments"]:
        return data["segments"][-1]["end"]
    return 0


def extract_chunks():
    """Main extraction function using BEST_FIT_SAFE algorithm."""
    base_dir = Path(__file__).parent.parent
    analysis_dir = Path(__file__).parent / "analysis"
    output_dir = Path(__file__).parent / "chunks" / "chanting"

    # Clean and recreate output directory
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("BEST_FIT_SAFE Chunk Extraction")
    print("=" * 60)
    print(f"Exclude last {EXTRACT_CONFIG['exclude_last_seconds']}s from chunk start points")
    print(f"Max {EXTRACT_CONFIG['max_chunks_per_duration']} chunks per duration per file")
    print(f"Include: {EXTRACT_CONFIG['include_filters']}")
    print(f"Exclude: {EXTRACT_CONFIG['exclude_filters']}")
    print()

    print("Loading segment analysis...")
    segments_by_file = load_segments(analysis_dir)

    # Filter files
    filtered_files = {
        k: v for k, v in segments_by_file.items()
        if should_process_file(k, EXTRACT_CONFIG["include_filters"], EXTRACT_CONFIG["exclude_filters"])
    }

    print(f"Found {len(filtered_files)} files to process\n")

    metadata: dict[str, list] = {
        "2min": [],
        "5min": [],
        "10min": []
    }

    total_chunks = {"2min": 0, "5min": 0, "10min": 0}

    for file_key, data in sorted(filtered_files.items()):
        duration = get_duration(data)
        print(f"\n{'─' * 50}")
        print(f"Processing: {file_key}")
        print(f"  Total duration: {duration:.1f}s ({duration/60:.1f} min)")
        print(f"  Segments: {len(data['segments'])}")

        # Find source file
        source_file = find_source_file(base_dir, file_key)

        if not source_file:
            print(f"  ⚠ WARNING: Source file not found, skipping")
            continue

        segments = data["segments"]
        day_id = extract_day_number(file_key)

        for config in CHUNK_CONFIGS:
            chunks = find_multiple_chunks_safe(
                segments,
                config.target_seconds,
                config.min_seconds,
                config.max_seconds,
                exclude_last_seconds=EXTRACT_CONFIG["exclude_last_seconds"],
                max_chunks=EXTRACT_CONFIG["max_chunks_per_duration"]
            )

            if not chunks:
                print(f"  {config.name}: No suitable chunks found")
                continue

            print(f"  {config.name}: Found {len(chunks)} chunks")

            for chunk_idx, chunk in enumerate(chunks, 1):
                output_name = f"{day_id}_{config.name}_c{chunk_idx}.mp3"
                output_file = output_dir / output_name

                print(f"    c{chunk_idx}: {chunk.start:.1f}s - {chunk.end:.1f}s ({chunk.duration:.1f}s)")

                success = extract_audio_chunk(source_file, output_file, chunk.start, chunk.end)

                if success:
                    metadata[config.name].append({
                        "file": output_name,
                        "source": file_key,
                        "start": round(chunk.start, 2),
                        "end": round(chunk.end, 2),
                        "duration": round(chunk.duration, 2)
                    })
                    total_chunks[config.name] += 1
                    print(f"       ✓ {output_name}")
                else:
                    print(f"       ✗ Failed to create {output_name}")

    # Save metadata
    metadata_file = Path(__file__).parent / "chunks" / "metadata.json"

    full_metadata = {
        "chanting": metadata,
        "outro": "outro.webm",
        "gong": "gong.mp3"
    }

    with open(metadata_file, "w") as f:
        json.dump(full_metadata, f, indent=2)

    print(f"\n{'=' * 60}")
    print("Extraction Complete!")
    print("=" * 60)
    print(f"  2min chunks:  {total_chunks['2min']}")
    print(f"  5min chunks:  {total_chunks['5min']}")
    print(f"  10min chunks: {total_chunks['10min']}")
    print(f"  Total:        {sum(total_chunks.values())}")
    print(f"\nMetadata: {metadata_file}")
    print(f"Chunks:   {output_dir}")


def main():
    extract_chunks()


if __name__ == "__main__":
    main()
