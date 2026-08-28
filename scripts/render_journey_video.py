"""Render the caption-led RehletShifaa journey film with original vector art."""
from pathlib import Path
import math, subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
OUT = PUBLIC / "media"
W, H, FPS, SCENE_LEN = 1280, 720, 20, 7
INK, BODY, TEAL, AQUA = "#29454D", "#47636B", "#247C86", "#65BDB5"
PALE, CREAM, SKY, PEACH, LAV, CORAL, WHITE, LINE = "#DDF4F0", "#FFF9F2", "#DCECF9", "#FDEBE4", "#EEEAF8", "#E98D78", "#FFFFFF", "#CDDDDC"
FD = ROOT / "frontend" / "src" / "assets" / "fonts"

def ft(size, bold=False): return ImageFont.truetype(str(FD / ("jakarta-latin-700.woff2" if bold else "jakarta-latin-400.woff2")), size)
F14, F18, F22, F34, F48, F62 = ft(14), ft(18,1), ft(22), ft(34,1), ft(48,1), ft(62,1)

SCENES = [
    ("Start with what you already have", "Your latest reports, scans and a short note are enough to begin."),
    ("Share your case securely", "Private document handling protects your information throughout the review."),
    ("One coordinator organises everything", "One point of contact explains what is missing and what happens next."),
    ("The right consultant reviews your case", "Your medical need guides the choice of senior consultant."),
    ("Understand the pathway before you travel", "Review the proposed next step and arrangements before deciding."),
    ("Travel support is available if you need it", "Optional packages can coordinate flights, visa guidance, airport reception and stay."),
    ("Consultant-led care in Egypt", "Clinical decisions remain with your treating consultant after assessment."),
    ("Support continues after you return home", "Your follow-up information stays organised beyond the visit."),
]

def ease(x):
    x=max(0,min(1,x)); return x*x*(3-2*x)
def rr(d,b,r,fill,outline=None,w=1): d.rounded_rectangle(b,r,fill,outline,width=w)
def wrap(d,text,f,width):
    lines=[]; cur=""
    for word in text.split():
        test=(cur+" "+word).strip()
        if d.textlength(test,font=f)<=width: cur=test
        else: lines.append(cur); cur=word
    if cur: lines.append(cur)
    return lines
def paragraph(d,x,y,text,f=F22,color=BODY,width=720,spacing=10):
    for i,line in enumerate(wrap(d,text,f,width)): d.text((x,y+i*(f.size+spacing)),line,font=f,fill=color)
def card(d,b,fill=WHITE,r=24):
    x1,y1,x2,y2=b; rr(d,(x1+5,y1+8,x2+5,y2+8),r,"#29454D18"); rr(d,b,r,fill,LINE,2)
def person(d,x,y,s=1,color=TEAL):
    d.ellipse((x-24*s,y-106*s,x+24*s,y-58*s),fill=color)
    rr(d,(x-54*s,y-52*s,x+54*s,y+70*s),int(30*s),color)
    d.arc((x-68*s,y-25*s,x+68*s,y+98*s),205,335,fill=WHITE,width=max(3,int(7*s)))
def doc(d,x,y,fill=WHITE):
    rr(d,(x,y,x+190,y+250),18,fill,LINE,2); d.polygon([(x+140,y),(x+190,y+50),(x+140,y+50)],fill=PALE)
    d.ellipse((x+28,y+26,x+58,y+56),fill=CORAL)
    for i,l in enumerate((100,135,112)): rr(d,(x+30,y+88+i*38,x+30+l,y+96+i*38),4,TEAL)
def shield(d,x,y,s=1):
    d.polygon([(x,y-62*s),(x+55*s,y-40*s),(x+45*s,y+30*s),(x,y+68*s),(x-45*s,y+30*s),(x-55*s,y-40*s)],fill=TEAL)
    d.line((x-22*s,y,x-4*s,y+20*s,x+28*s,y-20*s),fill=WHITE,width=max(4,int(8*s)),joint="curve")
def plane(d,x,y,s=.65):
    p=[(-76,5),(-8,-8),(42,-58),(60,-54),(38,-4),(78,14),(70,28),(24,18),(-6,56),(-23,52),(-12,16),(-70,20)]
    d.polygon([(x+a*s,y+b*s) for a,b in p],fill=TEAL)
def hospital(d,x,y):
    rr(d,(x,y,x+240,y+300),20,WHITE,LINE,2); d.rectangle((x+35,y+72,x+205,y+300),fill=PALE)
    d.rectangle((x+100,y+28,x+126,y+86),fill=CORAL); d.rectangle((x+84,y+44,x+142,y+70),fill=CORAL)
    for r in range(2):
        for c in range(3): rr(d,(x+50+c*58,y+100+r*52,x+77+c*58,y+127+r*52),5,SKY)
    rr(d,(x+102,y+244,x+138,y+300),5,TEAL)
def phone(d,x,y):
    rr(d,(x,y,x+200,y+310),28,INK); rr(d,(x+10,y+12,x+190,y+295),20,WHITE)
    d.ellipse((x+40,y+62,x+78,y+100),fill=PALE)
    for i,(c,l) in enumerate(((TEAL,78),(SKY,112),(PEACH,88))): rr(d,(x+88 if i==0 else x+40,y+70+i*56,x+(166 if i==0 else 40+l),y+80+i*56),5,c)
def path(d,progress):
    y=657; d.line((90,y,1190,y),fill=LINE,width=4); d.line((90,y,90+1100*progress,y),fill=AQUA,width=7)
    for i in range(9):
        x=90+i*137.5; d.ellipse((x-9,y-9,x+9,y+9),fill=TEAL if i/8<=progress else WHITE,outline=AQUA,width=3)
def base(index,t):
    im=Image.new("RGB",(W,H),CREAM); d=ImageDraw.Draw(im,"RGBA")
    d.ellipse((-120,-180,420,360),fill=PALE); d.ellipse((1050,420,1420,790),fill=LAV)
    path(d,(index+min(t/SCENE_LEN,1))/8); off=int((1-ease(t/.9))*26)
    rr(d,(64,42,184,78),18,PALE); d.text((124,60),f"STEP {index+1:02d}",font=F14,fill=TEAL,anchor="mm")
    d.text((64,106+off),SCENES[index][0],font=F48,fill=INK); paragraph(d,66,169+off,SCENES[index][1])
    return im,d
def frame(index,t):
    im,d=base(index,t); bob=math.sin(t*2.1)*5; slide=int((1-ease(t))*90)
    if index==0: doc(d,840+slide,205); doc(d,990+slide,245,SKY); d.text((995,530),"No complete file required",font=F18,fill=TEAL,anchor="mm")
    elif index==1: doc(d,790,220+bob); d.line((990,345,1055,345),fill=AQUA,width=10); d.polygon([(1055,326),(1085,345),(1055,364)],fill=AQUA); shield(d,1150,345,1.05)
    elif index==2:
        person(d,970,380+bob,1.2)
        for b,c in [((755,270,845,350),SKY),((1080,210,1180,294),PEACH),((1085,420,1190,505),LAV)]: card(d,b,c,18)
        d.line((845,310,905,340),fill=AQUA,width=5); d.line((1080,255,1025,320),fill=AQUA,width=5); d.line((1085,460,1025,405),fill=AQUA,width=5)
    elif index==3:
        for i,(label,c) in enumerate((("Cardiology",PEACH),("Dysphagia & rehabilitation",SKY),("Orthopedics",LAV))):
            y=210+i*112; card(d,(770+slide,y,1165+slide,y+86),c,20); d.ellipse((792+slide,y+20,838+slide,y+66),fill=WHITE); d.text((860+slide,y+43),label,font=F18,fill=INK,anchor="lm")
        shield(d,715,345,.62)
    elif index==4:
        card(d,(775,190,1165,510)); d.text((820,235),"YOUR CARE PATHWAY",font=F14,fill=TEAL)
        for i,item in enumerate(("Consultant review","Recommended next step","Expected arrangements")):
            y=300+i*70; d.ellipse((818,y-16,850,y+16),fill=PALE); d.line((827,y,837,y+10,846,y-10),fill=TEAL,width=4); d.text((875,y),item,font=F18,fill=INK,anchor="lm")
    elif index==5:
        plane(d,775+18*math.sin(t),330)
        for i,(label,c) in enumerate((("Visa",SKY),("Airport",PEACH),("Stay",LAV))):
            x=900+i*105; rr(d,(x,275,x+88,395),20,c,WHITE,2); d.text((x+44,420),label,font=F14,fill=INK,anchor="mm")
        d.text((985,505),"Optional · personalised · coordinated",font=F18,fill=TEAL,anchor="mm")
    elif index==6: hospital(d,790,205); person(d,1125,405+bob,.72); d.text((1125,530),"Treating consultant",font=F14,fill=INK,anchor="mm")
    else:
        phone(d,825,190); person(d,1130,400+bob,.72,AQUA); d.arc((750,145,1200,555),205,326,fill=TEAL,width=6); d.polygon([(1178,458),(1206,455),(1190,482)],fill=TEAL)
    return im
def end():
    im=Image.new("RGB",(W,H),CREAM); d=ImageDraw.Draw(im,"RGBA"); d.ellipse((-90,-110,470,450),fill=PALE); d.ellipse((920,330,1400,830),fill=PEACH)
    logo=Image.open(PUBLIC/"brand"/"icon.png").convert("RGBA").resize((138,138)); im.paste(logo,(571,95),logo); d=ImageDraw.Draw(im,"RGBA")
    d.text((640,275),"Rehlet",font=F62,fill=INK,anchor="ra"); d.text((640,275),"Shifaa",font=F62,fill=AQUA,anchor="la")
    d.text((640,365),"Clarity before you travel.",font=F34,fill=INK,anchor="mm"); d.text((640,414),"Support every step of the way.",font=F34,fill=INK,anchor="mm")
    rr(d,(470,485,810,550),18,TEAL); d.text((640,518),"START MY CARE REVIEW",font=F18,fill=WHITE,anchor="mm"); d.text((640,615),"Care coordination · Not an emergency service",font=F14,fill=BODY,anchor="mm"); return im
def render():
    import imageio_ffmpeg
    OUT.mkdir(parents=True,exist_ok=True); video=OUT/"rehletshifaa-journey-en.mp4"; poster=OUT/"rehletshifaa-journey-en-poster.jpg"
    cmd=[imageio_ffmpeg.get_ffmpeg_exe(),"-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-an","-vcodec","libx264","-preset","medium","-crf","21","-pix_fmt","yuv420p","-movflags","+faststart",str(video)]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE); total=(len(SCENES)*SCENE_LEN+6)*FPS
    for n in range(total):
        sec=n/FPS; im=frame(int(sec//SCENE_LEN),sec%SCENE_LEN) if sec<len(SCENES)*SCENE_LEN else end()
        if n==4*SCENE_LEN*FPS+40: im.save(poster,quality=91,optimize=True)
        p.stdin.write(im.tobytes())
        if n%(FPS*7)==0: print(f"Rendered {sec:.0f}/{total/FPS:.0f}s",flush=True)
    p.stdin.close()
    result = p.wait()
    if result:
        raise SystemExit(result)
    print(video)
if __name__=="__main__": render()
