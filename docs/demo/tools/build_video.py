import subprocess, re, math, os, sys, json
from PIL import Image, ImageDraw
S=os.path.dirname(os.path.abspath(__file__)).replace(chr(92),'/')
FF=S+'/v/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
A='docs/demo/assets/audio/'; HERO='docs/demo/assets/hero.mp4'; OUT=S+'/out4'; os.makedirs(OUT,exist_ok=True); os.makedirs(S+'/ov4',exist_ok=True)
FPS=30; PRE=0.6; POST=1.0; FLASH=1.2; ANIM=[0,10,12]; AFPS=15
meta=json.load(open(S+'/fr4/meta.json'))
N=len(meta)
def run(*a):
    r=subprocess.run([FF,'-y','-loglevel','error',*a],capture_output=True,text=True)
    if r.returncode: print(r.stderr); sys.exit(1)
def dur(f):
    r=subprocess.run([FF,'-i',f],capture_output=True,text=True).stderr
    m=re.search(r'Duration: (\d+):(\d+):([\d.]+)',r); return int(m[1])*3600+int(m[2])*60+float(m[3])
segs=[];wavs=[]
for i in range(N):
    n='%02d'%i; d=dur(A+f'ar-{n}.mp3'); L=math.ceil((PRE+d+POST)*FPS)/FPS
    run('-i',A+f'ar-{n}.mp3','-af',f'adelay={int(PRE*1000)}|{int(PRE*1000)},apad=whole_dur={L:.4f}','-t',f'{L:.4f}','-ar','44100','-ac','2','-c:a','pcm_s16le',f'{OUT}/a{n}.wav')
    out=f'{OUT}/v{n}.mp4'; enc=['-r',str(FPS),'-c:v','libx264','-preset','slow','-tune','stillimage','-crf','28','-pix_fmt','yuv420p','-g','90']
    if i in ANIM:
        run('-framerate',str(AFPS),'-i',f'{S}/fr4/s{n}_%03d.png','-vf',f'tpad=stop_mode=clone:stop_duration={L:.3f},fps={FPS},format=yuv420p','-t',f'{L:.4f}',*enc,out)
    else:
        hs=meta[str(i)]['hs']; vid=meta[str(i)]['video']; k=len(hs)
        args=['-loop','1','-framerate',str(FPS),'-i',f'{S}/fr4/s{n}.png']; fc='[0:v]format=yuv420p[b0]'; last='b0'; idx=1
        if vid:
            args+=['-stream_loop','-1','-i',HERO]
            fc+=f";[1:v]scale={vid['w']}:{vid['h']},fps={FPS},format=yuv420p[hv];[{last}][hv]overlay=x={vid['x']}:y={vid['y']}:shortest=0[bv]"; last='bv'; idx=2
        gap=(d-4)/k if k else 0
        for j,r in enumerate(hs):
            png=f'{S}/ov4/o{n}_{j}.png'
            im=Image.new('RGBA',(r['w'],r['h']),(0,0,0,0)); ImageDraw.Draw(im).rounded_rectangle((0,0,r['w']-1,r['h']-1),radius=8,outline=(224,122,95,255),width=3); im.save(png)
            st=PRE+1.2+j*gap
            args+=['-loop','1','-framerate',str(FPS),'-t',str(FLASH),'-i',png]
            fc+=f";[{idx+j}:v]format=yuva420p,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st={FLASH-0.35}:d=0.35:alpha=1,setpts=PTS+{st:.3f}/TB[f{j}]"
            fc+=f";[{last}][f{j}]overlay=x={r['x']}:y={r['y']}:eof_action=pass[b{j+1}]"; last=f'b{j+1}'
        run(*args,'-filter_complex',fc,'-map',f'[{last}]','-t',f'{L:.4f}',*enc,out)
    segs.append(f"file 'v{n}.mp4'"); wavs.append(f"file 'a{n}.wav'"); print(n,round(d,1),round(L,2),flush=True)
open(OUT+'/v.txt','w').write('\n'.join(segs)); open(OUT+'/a.txt','w').write('\n'.join(wavs))
run('-f','concat','-safe','0','-i',OUT+'/v.txt','-c','copy',OUT+'/video.mp4')
run('-f','concat','-safe','0','-i',OUT+'/a.txt','-c','copy',OUT+'/audio.wav')
run('-i',OUT+'/video.mp4','-i',OUT+'/audio.wav','-c:v','copy','-c:a','aac','-b:a','112k','-movflags','+faststart',OUT+'/journey.mp4')
print('video',round(dur(OUT+'/video.mp4'),2),'audio',round(dur(OUT+'/audio.wav'),2),'final',round(dur(OUT+'/journey.mp4'),2))
