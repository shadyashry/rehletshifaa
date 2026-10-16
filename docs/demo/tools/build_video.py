import subprocess, re, math, os, sys
S=os.path.dirname(os.path.abspath(__file__)).replace(chr(92),'/')
FF=S+'/v/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
A='docs/demo/assets/audio/'; OUT=S+'/out'; os.makedirs(OUT,exist_ok=True)
FPS=30; PRE=0.6; POST=1.0
def run(*a):
    r=subprocess.run([FF,'-y','-loglevel','error',*a],capture_output=True,text=True)
    if r.returncode: print(r.stderr); sys.exit(1)
def dur(f):
    r=subprocess.run([FF,'-i',f],capture_output=True,text=True).stderr
    m=re.search(r'Duration: (\d+):(\d+):([\d.]+)',r); return int(m[1])*3600+int(m[2])*60+float(m[3])
segs=[];wavs=[]
for i in range(16):
    n='%02d'%i; d=dur(A+f'ar-{n}.mp3')
    L=math.ceil((PRE+d+POST)*FPS)/FPS
    # audio padded to the exact slide length
    run('-i',A+f'ar-{n}.mp3','-af',f'adelay={int(PRE*1000)}|{int(PRE*1000)},apad=whole_dur={L:.4f}','-t',f'{L:.4f}','-ar','44100','-ac','2','-c:a','pcm_s16le',f'{OUT}/a{n}.wav')
    # video: the ring pulse loops over the slide, or a single still
    if 1<=i<=14: inp=['-framerate','10','-stream_loop','-1','-i',f'{S}/fr/s{n}_%02d.png']
    else: inp=['-loop','1','-framerate','10','-i',f'{S}/fr/s{n}_00.png']
    run(*inp,'-t',f'{L:.4f}','-r',str(FPS),'-vf','format=yuv420p','-c:v','libx264','-preset','medium','-crf','20','-g','30',f'{OUT}/v{n}.mp4')
    segs.append(f"file 'v{n}.mp4'"); wavs.append(f"file 'a{n}.wav'")
    print(n,round(d,1),round(L,2),flush=True)
open(OUT+'/v.txt','w').write('\n'.join(segs)); open(OUT+'/a.txt','w').write('\n'.join(wavs))
run('-f','concat','-safe','0','-i',OUT+'/v.txt','-c','copy',OUT+'/video.mp4')
run('-f','concat','-safe','0','-i',OUT+'/a.txt','-c','copy',OUT+'/audio.wav')
run('-i',OUT+'/video.mp4','-i',OUT+'/audio.wav','-c:v','copy','-c:a','aac','-b:a','128k','-shortest','-movflags','+faststart',OUT+'/journey.mp4')
print('total',dur(OUT+'/journey.mp4'))
