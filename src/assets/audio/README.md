# Checkpoint Audio Files

This directory contains the audio soundtracks that play when users enter each checkpoint.

## File Naming Convention

Each checkpoint should have an audio file named: `checkpoint-{id}.mp3`

### Checkpoint Audio Files

- `checkpoint-1.mp3` - Lobby กะช่องรีสอร์ท
- `checkpoint-2.mp3` - จากรีสอร์ทสู่พฤกษศาสตร์
- `checkpoint-3.mp3` - ต้นสาละอินเดีย
- `checkpoint-4.mp3` - ต้นมะหาด
- `checkpoint-5.mp3` - ต้นแก่นหวาย
- `checkpoint-6.mp3` - ต้นลัง
- `checkpoint-7.mp3` - ต้นป่าสน
- `checkpoint-8.mp3` - ต้นชมพู่
- `checkpoint-9.mp3` - ต้นมะเฟือง
- `checkpoint-10.mp3` - ต้นมะเดื่อ
- `checkpoint-11.mp3` - ต้นเหง้าน้ำ
- `checkpoint-12.mp3` - ต้นไม้น้ำ
- `checkpoint-13.mp3` - ต้นยั่งฤาษี
- `checkpoint-14.mp3` - ต้นมะยม
- `checkpoint-15.mp3` - ต้นลิง
- `checkpoint-16.mp3` - ต้นสมเด็จพระนเรศวรมหาราช
- `checkpoint-17.mp3` - ต้นไม้เก่า
- `checkpoint-18.mp3` - สิ้นสุดการเดินป่า

## Instructions

1. Replace the audio files with actual MP3 files for each checkpoint
2. Each audio file should be in MP3 format for best browser compatibility
3. The AudioService will automatically play the corresponding audio when a user enters a checkpoint
4. Current audio path format: `/assets/audio/checkpoint-{checkpointId}.mp3`

## Audio Guidelines

- **Duration**: Recommended 5-30 seconds
- **Volume**: Normalize audio to -3dB to -6dB for comfortable listening
- **Format**: MP3 (44.1 kHz or 48 kHz, 128-192 kbps bitrate)
- **Content**: Can be:
  - Nature sounds/ambiance
  - Plant identification information
  - Welcome message for the checkpoint
  - Instructions for the task at that checkpoint

## Implementation Notes

The audio is triggered automatically when:
1. User's GPS location enters a checkpoint's radius
2. The checkpoint hasn't been reached before in this session
3. Audio will stop automatically when the user enters the next checkpoint
4. Audio can be controlled via the AudioService methods:
   - `playCheckpointAudio()` - Play a checkpoint's audio
   - `pauseAudio()` - Pause current audio
   - `resumeAudio()` - Resume playing
   - `stopAudio()` - Stop playback
   - `setVolume()` - Adjust volume (0-1)
