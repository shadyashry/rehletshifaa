"""Generate and mix the English journey narration into the rendered film."""
from __future__ import annotations

import asyncio
import subprocess
import tempfile
from pathlib import Path

import edge_tts
import imageio_ffmpeg


ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "frontend" / "public" / "media"
VIDEO = MEDIA / "rehletshifaa-journey-en.mp4"
VOICE = MEDIA / "rehletshifaa-journey-en-voice.mp3"
VOICE_NAME = "en-GB-SoniaNeural"

NARRATION = (
    "When medical decisions feel unclear, you should not have to navigate the journey alone. "
    "Start securely with the reports, scans and tests you already have. "
    "A dedicated RehletShifaa coordinator organises your case, explains what may be missing, "
    "and supports you in Arabic or English. "
    "Your information is directed to an experienced consultant according to your medical needs. "
    "You then receive a clearer proposed pathway, helping you make an informed decision before travelling. "
    "If you choose care in Egypt, optional professional support can coordinate flights, visa guidance, "
    "airport reception, transfers and your stay according to your needs. "
    "In Egypt, your treating consultant leads the medical decisions after the appropriate clinical assessment. "
    "And after your visit, RehletShifaa helps keep your follow-up journey organised. "
    "RehletShifaa. Clarity before you travel. Support every step of the way."
)


async def synthesize() -> None:
    communicator = edge_tts.Communicate(NARRATION, VOICE_NAME, rate="-8%", pitch="-2Hz")
    await communicator.save(str(VOICE))


def mix() -> None:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.TemporaryDirectory(prefix="rehletshifaa-voice-") as folder:
        mastered = Path(folder) / "journey-mastered.mp4"
        command = [
            ffmpeg,
            "-y",
            "-i", str(VIDEO),
            "-i", str(VOICE),
            "-filter_complex", "[1:a]volume=1.25,afade=t=in:st=0:d=0.5,afade=t=out:st=59:d=2,apad[a]",
            "-map", "0:v:0",
            "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "128k",
            "-t", "62",
            "-movflags", "+faststart",
            str(mastered),
        ]
        subprocess.run(command, check=True)
        VIDEO.write_bytes(mastered.read_bytes())


if __name__ == "__main__":
    asyncio.run(synthesize())
    mix()
    print(VIDEO)
