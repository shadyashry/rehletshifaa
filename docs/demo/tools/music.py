import numpy as np, wave, sys
sr=44100; DUR=330; rng=np.random.default_rng(7)
t=np.arange(int(sr*DUR))/sr
L=np.zeros_like(t); R=np.zeros_like(t)
def hz(n): return 440*2**((n-69)/12)
# slow chord loop (C major 7 -> A minor 7 -> F major 7 -> G sus/6), 12 s each, soft overlapping pads
chords=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,57,62]]
CH=12.0
for k in range(int(DUR/CH)+1):
    ch=chords[k%4]; t0=k*CH
    i0=int(t0*sr); i1=min(len(t),int((t0+CH+4)*sr))
    if i0>=len(t): break
    tt=t[i0:i1]-t0
    env=np.minimum(1,tt/4.0)*np.minimum(1,np.maximum(0,(CH+4-tt)/4.0))
    env=env**1.5
    for j,n in enumerate(ch):
        f=hz(n)
        for det in (-1.6,0,1.6):
            ff=f*2**(det/1200)
            s=np.sin(2*np.pi*ff*tt)+0.28*np.sin(2*np.pi*2*ff*tt)+0.08*np.sin(2*np.pi*3*ff*tt)
            pan=0.5+0.35*np.sin(0.7*j+det)
            amp=0.045*env/ (1+0.25*j)
            L[i0:i1]+=s*amp*(1-pan); R[i0:i1]+=s*amp*pan
# sparse bell notes (pentatonic), long decay
pent=[72,74,76,79,81,84]
tb=6.0
while tb<DUR-8:
    n=int(rng.choice(pent)); f=hz(n); tt=np.arange(int(sr*5.5))/sr
    env=np.exp(-tt/1.6)*np.minimum(1,tt/0.01)
    s=(np.sin(2*np.pi*f*tt)+0.35*np.sin(2*np.pi*2.01*f*tt)*np.exp(-tt/0.8)+0.12*np.sin(2*np.pi*3.97*f*tt)*np.exp(-tt/0.4))*env*0.05
    i0=int(tb*sr); i1=min(len(t),i0+len(s)); pan=rng.uniform(0.2,0.8)
    L[i0:i1]+=s[:i1-i0]*(1-pan); R[i0:i1]+=s[:i1-i0]*pan
    tb+=rng.uniform(4.5,8.5)
# slow tremolo for movement, fades
trem=1+0.06*np.sin(2*np.pi*0.09*t)
L*=trem; R*=trem
fade=np.minimum(1,t/4.0)*np.minimum(1,(DUR-t)/6.0)
L*=fade; R*=fade
m=max(abs(L).max(),abs(R).max()); L=L/m*0.6; R=R/m*0.6
pcm=(np.stack([L,R],1)*32767).astype('<i2')
with wave.open('music_raw.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
print('ok')
