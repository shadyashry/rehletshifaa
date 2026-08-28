"""Generate and professionally mix Arabic narration over the calm score."""
from __future__ import annotations

import asyncio
import subprocess
import tempfile
from pathlib import Path

import edge_tts
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "frontend" / "public" / "media"
VIDEO = MEDIA / "rehletshifaa-journey-ar.mp4"
VOICE = MEDIA / "rehletshifaa-journey-ar-voice.mp3"

NARRATION = (
    "عندما تكون الخطوة الطبية غير واضحة، لا تواجه الرحلة وحدك. "
    "ابدأ بتقاريرك وفحوصاتك المتوفرة. هذا يكفي لنبدأ معك. "
    "يُنَظِّم مُنَسِّق رِحلة شِفاء حالتك، ويشرح لك ما ينقصها، "
    "ويدعمك بالعربية أو الإنجليزية. "
    "بعد ذلك، تُعرَض معلوماتك على الاستشاري الأنسب لاحتياجك الطبي. "
    "تحصل على مسار واضح وخطوة مقترحة، لتتخذ قرارك قبل السفر. "
    "وإذا اخترت الرعاية في مصر، يمكننا ترتيب دعم سفر اختياري يناسب احتياجاتك. "
    "يشمل ذلك التأشيرة، والاستقبال في المطار، والتنقل، والإقامة. "
    "في مصر، يقود استشاريك المعالج القرارات الطبية بعد التقييم المناسب. "
    "وبعد عودتك، نساعدك على تنظيم المتابعة. "
    "رِحلة شِفاء. وُضوح قبل السفر، ودعم في كل خطوة."
)

async def synthesize():
    voice = edge_tts.Communicate(NARRATION, "ar-EG-SalmaNeural", rate="-2%", pitch="-1Hz")
    await voice.save(str(VOICE))

def mix():
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.TemporaryDirectory(prefix="rehletshifaa-ar-voice-") as folder:
        mastered=Path(folder)/"journey-ar-mastered.mp4"
        filters=(
            "[0:a]lowpass=f=6000,volume=0.08[music];"
            "[1:a]highpass=f=90,lowpass=f=10000,afftdn=nf=-28,acompressor=threshold=-20dB:ratio=2.0:attack=20:release=180,"
            "volume=1.35,afade=t=in:st=0:d=0.45,afade=t=out:st=63:d=2,apad[voice];"
            "[music][voice]amix=inputs=2:duration=longest:dropout_transition=2:normalize=0[a]"
        )
        command=[ffmpeg,"-y","-i",str(VIDEO),"-i",str(VOICE),"-filter_complex",filters,"-map","0:v:0","-map","[a]","-c:v","copy","-c:a","aac","-b:a","160k","-t","70","-movflags","+faststart",str(mastered)]
        subprocess.run(command,check=True)
        VIDEO.write_bytes(mastered.read_bytes())

if __name__=="__main__":
    asyncio.run(synthesize()); mix(); print(VIDEO)
