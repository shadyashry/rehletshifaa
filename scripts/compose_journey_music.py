"""Compose and mix an original calm ambient score for the Arabic journey film."""
from pathlib import Path
import subprocess, wave

import numpy as np
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[1]
MEDIA=ROOT/"frontend"/"public"/"media"
VIDEO=MEDIA/"rehletshifaa-journey-ar.mp4"
MUSIC=MEDIA/"rehletshifaa-journey-calm-music.wav"
RATE, DURATION = 44100, 70

def tone(freq,t):
    return np.sin(2*np.pi*freq*t)+0.18*np.sin(2*np.pi*freq*2*t)

def compose():
    t=np.arange(RATE*DURATION,dtype=np.float64)/RATE
    left=np.zeros_like(t); right=np.zeros_like(t)
    chords=[(130.81,164.81,196.00,246.94),(110.00,130.81,164.81,196.00),(87.31,130.81,164.81,196.00),(98.00,146.83,196.00,220.00)]
    block=14
    for start in range(0,DURATION,block):
        chord=chords[(start//block)%len(chords)]; mask=(t>=start)&(t<min(start+block,DURATION)); local=t[mask]-start
        env=np.minimum(local/3,1)*np.minimum((block-local)/3,1); env=np.clip(env,0,1)
        pad=sum(tone(f,local) for f in chord)/len(chord)
        left[mask]+=pad*env*.10; right[mask]+=pad*env*.10
    notes=[261.63,329.63,392.00,493.88,440.00,392.00,329.63,293.66,261.63]
    for i,start in enumerate(range(3,69,7)):
        length=2.8; mask=(t>=start)&(t<start+length); local=t[mask]-start
        env=np.exp(-1.45*local)*(1-np.exp(-10*local)); bell=tone(notes[i%len(notes)],local)*env*.075
        pan=.35+.3*((i%3)/2); left[mask]+=bell*(1-pan); right[mask]+=bell*pan
    fade=np.minimum(t/3,1)*np.minimum((DURATION-t)/4,1); fade=np.clip(fade,0,1)
    audio=np.stack((left*fade,right*fade),axis=1); peak=max(np.max(np.abs(audio)),1e-6); audio=audio/peak*.34
    pcm=(audio*32767).astype(np.int16)
    with wave.open(str(MUSIC),"wb") as out:
        out.setnchannels(2); out.setsampwidth(2); out.setframerate(RATE); out.writeframes(pcm.tobytes())

def mix():
    ffmpeg=imageio_ffmpeg.get_ffmpeg_exe(); mastered=MEDIA/"rehletshifaa-journey-ar-music.mp4"
    cmd=[ffmpeg,"-y","-i",str(VIDEO),"-i",str(MUSIC),"-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","128k","-t",str(DURATION),"-movflags","+faststart",str(mastered)]
    subprocess.run(cmd,check=True); VIDEO.write_bytes(mastered.read_bytes()); mastered.unlink()

if __name__=="__main__": compose(); mix(); print(VIDEO)
