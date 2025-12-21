#!/usr/bin/env python3
"""
Analyze Vipassana audio files to detect chanting vs silence segments.
Generates visualization and identifies segment boundaries.
"""

import librosa
import librosa.display
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path
import json


def analyze_audio(file_path: str, output_dir: str = "analysis"):
    """Analyze a single audio file and generate visualization."""

    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)

    file_name = Path(file_path).stem
    print(f"\nAnalyzing: {file_name}")

    # Load audio (sr=None preserves original sample rate)
    print("  Loading audio...")
    y, sr = librosa.load(file_path, sr=22050)  # Downsample for faster processing
    duration = librosa.get_duration(y=y, sr=sr)
    print(f"  Duration: {duration/60:.1f} minutes ({duration:.0f} seconds)")

    # Calculate RMS energy over time (1-second windows)
    print("  Calculating energy levels...")
    hop_length = sr  # 1 second windows
    frame_length = sr * 2  # 2 second frames with overlap

    rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
    times = librosa.times_like(rms, sr=sr, hop_length=hop_length)

    # Normalize RMS
    rms_normalized = rms / np.max(rms) if np.max(rms) > 0 else rms

    # Detect segments using threshold
    threshold = 0.05  # Silence threshold (adjustable)
    is_active = rms_normalized > threshold

    # Find segment boundaries
    segments = []
    in_segment = False
    segment_start = 0

    for i, active in enumerate(is_active):
        if active and not in_segment:
            segment_start = times[i]
            in_segment = True
        elif not active and in_segment:
            segment_end = times[i]
            if segment_end - segment_start > 3:  # Ignore segments < 3 seconds
                segments.append({
                    "start": float(segment_start),
                    "end": float(segment_end),
                    "duration": float(segment_end - segment_start)
                })
            in_segment = False

    # Handle final segment
    if in_segment:
        segments.append({
            "start": float(segment_start),
            "end": float(duration),
            "duration": float(duration - segment_start)
        })

    # Merge nearby segments (gaps < 2 seconds)
    merged_segments = []
    for seg in segments:
        if merged_segments and seg["start"] - merged_segments[-1]["end"] < 2:
            merged_segments[-1]["end"] = seg["end"]
            merged_segments[-1]["duration"] = merged_segments[-1]["end"] - merged_segments[-1]["start"]
        else:
            merged_segments.append(seg)

    print(f"  Found {len(merged_segments)} distinct segments")

    # Create visualization
    fig, axes = plt.subplots(3, 1, figsize=(16, 10))

    # Plot 1: Waveform
    ax1 = axes[0]
    librosa.display.waveshow(y, sr=sr, ax=ax1, alpha=0.6)
    ax1.set_title(f"Waveform: {file_name}")
    ax1.set_xlabel("")

    # Plot 2: RMS Energy over time
    ax2 = axes[1]
    ax2.plot(times, rms_normalized, color='blue', linewidth=0.8)
    ax2.axhline(y=threshold, color='red', linestyle='--', label=f'Threshold ({threshold})')
    ax2.fill_between(times, 0, rms_normalized, alpha=0.3)
    ax2.set_title("Energy Level Over Time")
    ax2.set_xlabel("Time (seconds)")
    ax2.set_ylabel("Normalized RMS")
    ax2.legend()

    # Plot 3: Detected segments
    ax3 = axes[2]
    ax3.set_xlim(0, duration)
    ax3.set_ylim(0, 1)

    colors = plt.cm.Set2(np.linspace(0, 1, len(merged_segments)))
    for i, seg in enumerate(merged_segments):
        ax3.axvspan(seg["start"], seg["end"], alpha=0.5, color=colors[i])
        mid = (seg["start"] + seg["end"]) / 2
        ax3.text(mid, 0.5, f'{i+1}\n{seg["duration"]/60:.1f}m',
                ha='center', va='center', fontsize=8)

    ax3.set_title(f"Detected Segments ({len(merged_segments)} total)")
    ax3.set_xlabel("Time (seconds)")
    ax3.set_yticks([])

    # Add time markers every 5 minutes
    for t in range(0, int(duration), 300):
        ax3.axvline(x=t, color='gray', linestyle=':', alpha=0.5)
        ax3.text(t, 1.02, f'{t//60}m', ha='center', fontsize=8)

    plt.tight_layout()

    # Save visualization
    viz_path = output_path / f"{file_name}_analysis.png"
    plt.savefig(viz_path, dpi=150)
    plt.close()
    print(f"  Saved visualization: {viz_path}")

    # Save segment data
    result = {
        "file": file_name,
        "duration_seconds": duration,
        "duration_minutes": duration / 60,
        "segments": merged_segments
    }

    json_path = output_path / f"{file_name}_segments.json"
    with open(json_path, 'w') as f:
        json.dump(result, f, indent=2)
    print(f"  Saved segment data: {json_path}")

    # Print segment summary
    print("\n  Segment Summary:")
    for i, seg in enumerate(merged_segments):
        start_m = int(seg["start"] // 60)
        start_s = int(seg["start"] % 60)
        end_m = int(seg["end"] // 60)
        end_s = int(seg["end"] % 60)
        dur_m = seg["duration"] / 60
        print(f"    {i+1}. {start_m:02d}:{start_s:02d} - {end_m:02d}:{end_s:02d} ({dur_m:.1f} min)")

    return result


def main():
    sample_dir = Path("sample")

    if not sample_dir.exists():
        print("No 'sample' directory found!")
        return

    audio_files = list(sample_dir.glob("*.mp3")) + list(sample_dir.glob("*.wav")) + list(sample_dir.glob("*.m4a"))

    if not audio_files:
        print("No audio files found in sample/")
        return

    print(f"Found {len(audio_files)} audio file(s)")

    all_results = []
    for audio_file in audio_files:
        result = analyze_audio(str(audio_file))
        all_results.append(result)

    # Save combined results
    with open("analysis/all_segments.json", 'w') as f:
        json.dump(all_results, f, indent=2)

    print("\n" + "="*50)
    print("Analysis complete! Check the 'analysis/' folder for:")
    print("  - Visual waveforms and energy plots (*_analysis.png)")
    print("  - Segment data in JSON format (*_segments.json)")


if __name__ == "__main__":
    main()
