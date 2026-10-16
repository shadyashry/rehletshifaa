import subprocess, re, math, os, sys, json
S=os.path.dirname(os.path.abspath(__file__)).replace(chr(92),'/')
FF=S+'/v/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
A='docs/demo/assets/audio/'; OUT=S+'/out3'; os.makedirs(OUT,exist_ok=True)
FPS=30; PRE=0.6; POST=1.0; FLASH=1.2
rects=json.load(open(S+'/fr2/rects.json'))
def run(*a):
    r=subprocess.run([FF,'-y','-loglevel','error',*a],capture_output=True,text=True)
    if r.returncode: print(r.stderr); sys.exit(1)
def dur(f):
    r=subprocess.run([FF,'-i',f],capture_output=True,text=True).stderr
    m=re.search(r'Duration: (\d+):(\d+):([\d.]+)',r); return int(m[1])*3600+int(m[2])*60+float(m[3])
segs=[];wavs=[]
for i in range(16):
    n='%02d'%i; d=dur(A+f'ar-{n}.mp3'); L=math.ceil((PRE+d+POST)*FPS)/FPS
    run('-i',A+f'ar-{n}.mp3','-af',f'adelay={int(PRE*1000)}|{int(PRE*1000)},apad=whole_dur={L:.4f}','-t',f'{L:.4f}','-ar','44100','-ac','2','-c:a','pcm_s16le',f'{OUT}/a{n}.wav')
    hs=rects[str(i)]; k=len(hs)
    args=['-loop','1','-framerate',str(FPS),'-i',f'{S}/fr2/s{n}.png']
    fc='[0:v]format=yuv420p[b0]'; last='b0'
    gap=(d-4)/k if k else 0
    for j,r in enumerate(hs):
        st=PRE+1.2+j*gap
        args+=['-loop','1','-framerate',str(FPS),'-t',str(FLASH),'-i',f'{S}/ov/o{n}_{j}.png']
        fc+=f";[{j+1}:v]format=yuva420p,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st={FLASH-0.35}:d=0.35:alpha=1,setpts=PTS+{st:.3f}/TB[f{j}]"
        fc+=f";[{last}][f{j}]overlay=x={r['x']}:y={r['y']}:eof_action=pass[b{j+1}]"; last=f'b{j+1}'
    run(*args,'-filter_complex',fc,'-map',f'[{last}]','-t',f'{L:.4f}','-r',str(FPS),'-c:v','libx264','-preset','slow','-tune','stillimage','-crf','28','-pix_fmt','yuv420p','-g','90',f'{OUT}/v{n}.mp4')
    segs.append(f"file 'v{n}.mp4'"); wavs.append(f"file 'a{n}.wav'"); print(n,round(L,2),flush=True)
open(OUT+'/v.txt','w').write('\n'.join(segs)); open(OUT+'/a.txt','w').write('\n'.join(wavs))
run('-f','concat','-safe','0','-i',OUT+'/v.txt','-c','copy',OUT+'/video.mp4')
run('-f','concat','-safe','0','-i',OUT+'/a.txt','-c','copy',OUT+'/audio.wav')
run('-i',OUT+'/video.mp4','-i',OUT+'/audio.wav','-c:v','copy','-c:a','aac','-b:a','112k','-movflags','+faststart',OUT+'/journey.mp4')
print('video',dur(OUT+'/video.mp4'),'audio',dur(OUT+'/audio.wav'),'final',dur(OUT+'/journey.mp4'))
