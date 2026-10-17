import subprocess, re, math, os, sys, json
S=os.path.dirname(os.path.abspath(__file__)).replace(chr(92),'/')
FF=S+'/v/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
A='docs/demo/assets/audio/'; HERO='docs/demo/assets/hero.mp4'; MUSIC=A+'music.mp3'; OUT=S+'/out5'; os.makedirs(OUT,exist_ok=True)
FPS=30; PRE=0.6; POST=1.0
meta=json.load(open(S+'/fr5/meta.json')); N=19
MUSIC_GAIN=float(os.environ.get('MUSIC_GAIN','0.5'))
def run(*a):
    r=subprocess.run([FF,'-y','-loglevel','error',*a],capture_output=True,text=True)
    if r.returncode: print(r.stderr); sys.exit(1)
def dur(f):
    r=subprocess.run([FF,'-i',f],capture_output=True,text=True).stderr
    m=re.search(r'Duration: (\d+):(\d+):([\d.]+)',r); return int(m[1])*3600+int(m[2])*60+float(m[3])
segs=[];wavs=[]
for i in range(N):
    n='%02d'%i; d=dur(A+f'ar-{n}.mp3'); L=math.ceil((PRE+d+(2.4 if i==0 else POST))*FPS)/FPS
    run('-i',A+f'ar-{n}.mp3','-af',f'adelay={int(PRE*1000)}|{int(PRE*1000)},apad=whole_dur={L:.4f}','-t',f'{L:.4f}','-ar','44100','-ac','2','-c:a','pcm_s16le',f'{OUT}/a{n}.wav')
    out=f'{OUT}/v{n}.mp4'; enc=['-r',str(FPS),'-c:v','libx264','-preset','slow','-tune','stillimage','-crf','28','-pix_fmt','yuv420p','-g','90']
    fr=meta['frames'].get(str(i))
    if fr:
        run('-framerate',str(fr['fps']),'-i',f'{S}/fr5/s{n}_%03d.png','-vf',f'tpad=stop_mode=clone:stop_duration={L:.3f},fps={FPS},format=yuv420p','-t',f'{L:.4f}',*enc,out)
    else:
        vid=meta['video'].get(str(i))
        args=['-loop','1','-framerate',str(FPS),'-i',f'{S}/fr5/s{n}.png']; fc='[0:v]format=yuv420p[b0]'; last='b0'
        if vid:
            args+=['-stream_loop','-1','-i',HERO]
            fc+=f";[1:v]scale={vid['w']}:{vid['h']},fps={FPS},format=yuv420p[hv];[{last}][hv]overlay=x={vid['x']}:y={vid['y']}[bv]"; last='bv'
        run(*args,'-filter_complex',fc,'-map',f'[{last}]','-t',f'{L:.4f}',*enc,out)
    segs.append(f"file 'v{n}.mp4'"); wavs.append(f"file 'a{n}.wav'"); print(n,round(d,1),round(L,2),flush=True)
open(OUT+'/v.txt','w').write('\n'.join(segs)); open(OUT+'/a.txt','w').write('\n'.join(wavs))
run('-f','concat','-safe','0','-i',OUT+'/v.txt','-c','copy',OUT+'/video.mp4')
run('-f','concat','-safe','0','-i',OUT+'/a.txt','-c','copy',OUT+'/voice.wav')
D=dur(OUT+'/voice.wav')
# calm music under the voice: quiet bed, ducked while the voice speaks, faded in and out
fc=(f"[1:a]volume={MUSIC_GAIN},afade=t=in:st=0:d=3[m];[0:a]asplit=2[v][sc];"
    f"[m][sc]sidechaincompress=threshold=0.015:ratio=8:attack=40:release=700[mc];"
    f"[v][mc]amix=inputs=2:normalize=0:duration=first,afade=t=out:st={D-3.5:.2f}:d=3.5,alimiter=limit=0.95[a]")
run('-i',OUT+'/voice.wav','-stream_loop','-1','-i',MUSIC,'-filter_complex',fc,'-map','[a]','-t',f'{D:.3f}','-ar','44100','-ac','2',OUT+'/audio.wav')
run('-i',OUT+'/video.mp4','-i',OUT+'/audio.wav','-c:v','copy','-c:a','aac','-b:a','128k','-movflags','+faststart',OUT+'/journey.mp4')
print('video',round(dur(OUT+'/video.mp4'),2),'audio',round(dur(OUT+'/audio.wav'),2),'final',round(dur(OUT+'/journey.mp4'),2))
