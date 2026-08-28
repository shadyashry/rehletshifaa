"""Render the enhanced Arabic RehletShifaa journey film with native RTL text."""
from pathlib import Path
import math, subprocess

from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display
import imageio_ffmpeg

import render_journey_video as en

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public"
OUT = PUBLIC / "media"
W, H, FPS, SCENE_LEN = en.W, en.H, en.FPS, en.SCENE_LEN
ENTRY_LEN, EXIT_LEN = 5, 9
INK, BODY, TEAL, AQUA = en.INK, en.BODY, en.TEAL, en.AQUA
PALE, CREAM, SKY, PEACH, LAV, CORAL, WHITE, LINE = en.PALE, en.CREAM, en.SKY, en.PEACH, en.LAV, en.CORAL, en.WHITE, en.LINE
FONT = Path("C:/Windows/Fonts/arialbd.ttf")
FONT_REG = Path("C:/Windows/Fonts/arial.ttf")

def ft(size, bold=True): return ImageFont.truetype(str(FONT if bold else FONT_REG), size)
F13, F16, F20, F30, F42, F56 = ft(13), ft(16), ft(20,False), ft(30), ft(42), ft(56)
def ar(text): return get_display(arabic_reshaper.reshape(text))

SCENES = [
    ("ابدأ بما لديك من تقارير", "تقاريرك وفحوصاتك الحالية وملاحظة قصيرة تكفي للبدء."),
    ("شارك حالتك بأمان", "نتعامل مع مستنداتك الطبية بخصوصية طوال رحلة المراجعة."),
    ("منسق واحد يرتب رحلتك", "نقطة تواصل ثابتة تشرح ما ينقصك وما هي الخطوة التالية."),
    ("الاستشاري المناسب يراجع حالتك", "احتياجك الطبي هو ما يحدد اختيار الاستشاري المناسب."),
    ("افهم مسار الرعاية قبل السفر", "راجع الخطوة المقترحة والترتيبات المتوقعة قبل أن تقرر."),
    ("دعم سفر احترافي عند الحاجة", "باقات اختيارية لتنسيق الطيران والتأشيرة والاستقبال والإقامة."),
    ("رعاية يقودها الاستشاري في مصر", "تبقى القرارات الطبية مع استشاريك المعالج بعد التقييم المناسب."),
    ("المتابعة تستمر بعد عودتك", "نبقي معلومات المتابعة منظمة بعد انتهاء الزيارة وعودتك إلى بلدك."),
]

def rr(d,b,r,fill,outline=None,w=1): d.rounded_rectangle(b,r,fill,outline,width=w)
def text_width(d,text,f): return d.textlength(ar(text),font=f)
def lines(d,text,f,max_width):
    words=text.split(); result=[]; current=""
    for word in words:
        candidate=(current+" "+word).strip()
        if text_width(d,candidate,f)<=max_width: current=candidate
        else: result.append(current); current=word
    if current: result.append(current)
    return result
def draw_rtl(d,x,y,text,f,color,max_width,spacing=8):
    for i,line in enumerate(lines(d,text,f,max_width)):
        d.text((x,y+i*(f.size+spacing)),ar(line),font=f,fill=color,anchor="ra")
def sparkle(d,x,y,r,color):
    d.ellipse((x-r,y-r,x+r,y+r),fill=color)
    d.line((x-r*2,y,x+r*2,y),fill=color,width=2); d.line((x,y-r*2,x,y+r*2),fill=color,width=2)

def character(d,x,y,role="patient",scale=1.0):
    colors={"patient":(CORAL,PEACH),"coordinator":(TEAL,PALE),"consultant":(INK,SKY)}
    body,accent=colors[role]; r=22*scale
    d.ellipse((x-r,y-86*scale-r,x+r,y-86*scale+r),fill="#D79A72")
    if role=="consultant": d.arc((x-r-2,y-89*scale-r,x+r+2,y-79*scale+r),180,355,fill=INK,width=max(3,int(7*scale)))
    en.rr(d,(x-49*scale,y-55*scale,x+49*scale,y+58*scale),int(27*scale),body)
    d.arc((x-60*scale,y-32*scale,x+60*scale,y+82*scale),205,335,fill=accent,width=max(3,int(6*scale)))
    if role=="coordinator":
        d.arc((x-31*scale,y-116*scale,x+31*scale,y-56*scale),190,350,fill=INK,width=max(2,int(4*scale)))
        d.line((x+28*scale,y-70*scale,x+42*scale,y-58*scale),fill=INK,width=max(2,int(4*scale)))
        d.ellipse((x+38*scale,y-62*scale,x+44*scale,y-56*scale),fill=CORAL)
    if role=="consultant":
        d.arc((x-23*scale,y-31*scale,x+23*scale,y+22*scale),195,345,fill=WHITE,width=max(2,int(4*scale)))
        d.ellipse((x+17*scale,y+14*scale,x+27*scale,y+24*scale),outline=WHITE,width=max(2,int(3*scale)))

def bubble(d,box,text,fill=WHITE,tail="left"):
    x1,y1,x2,y2=box; en.rr(d,box,18,fill,LINE,2)
    if tail=="left": d.polygon([(x1+20,y2-3),(x1+4,y2+18),(x1+44,y2-3)],fill=fill)
    else: d.polygon([(x2-44,y2-3),(x2-4,y2+18),(x2-20,y2-3)],fill=fill)
    d.text(((x1+x2)/2,(y1+y2)/2),ar(text),font=F13,fill=INK,anchor="mm")

def entry_frame(t):
    im=Image.new("RGB",(W,H),CREAM); d=ImageDraw.Draw(im,"RGBA")
    d.ellipse((-140,-160,440,420),fill=PALE); d.ellipse((1040,430,1420,810),fill=LAV)
    logo=Image.open(PUBLIC/"brand"/"icon.png").convert("RGBA").resize((92,92)); im.paste(logo,(594,44),logo)
    d.text((640,165),ar("رحلة شفاء"),font=F42,fill=INK,anchor="mm")
    d.text((640,224),ar("من الحيرة إلى مسار أوضح للرعاية"),font=F30,fill=INK,anchor="mm")
    patient_x=330+35*en.ease(t/2); coordinator_x=950-35*en.ease(t/2)
    character(d,patient_x,455,"patient",1.15); character(d,coordinator_x,455,"coordinator",1.15)
    bubble(d,(190,292,470,365),"لدي تقارير.. ما الخطوة التالية؟",PEACH,"right")
    if t>1.2: bubble(d,(795,292,1090,365),"سننظم حالتك ونوضح لك الطريق",PALE,"left")
    progress=en.ease(t/4.5); d.line((445,485,835,485),fill=LINE,width=6); d.line((445,485,445+390*progress,485),fill=AQUA,width=8)
    dot=445+390*progress; d.ellipse((dot-10,475,dot+10,495),fill=CORAL,outline=WHITE,width=3)
    d.text((640,625),ar("تبدأ الرحلة بما لديك الآن"),font=F20,fill=TEAL,anchor="mm")
    return im

def arabic_header(im,index,t):
    d=ImageDraw.Draw(im,"RGBA")
    d.rectangle((0,0,W,190),fill=CREAM)
    d.rectangle((0,190,760,265),fill=CREAM)
    d.ellipse((-120,-180,420,360),fill=PALE)
    rr(d,(590,42,716,80),18,PALE)
    d.text((653,61),ar(f"الخطوة {index+1:02d}"),font=F13,fill=TEAL,anchor="mm")
    offset=int((1-en.ease(t/.9))*22)
    draw_rtl(d,720,108+offset,SCENES[index][0],F42,INK,655,6)
    title_lines=len(lines(d,SCENES[index][0],F42,655))
    draw_rtl(d,720,172+offset+(title_lines-1)*46,SCENES[index][1],F20,BODY,655,9)
    return d

def translate_visual_labels(d,index):
    if index==0:
        d.rectangle((815,505,1175,550),fill=CREAM); d.text((995,530),ar("لا تحتاج إلى ملف كامل"),font=F16,fill=TEAL,anchor="mm")
    elif index==3:
        labels=(("أمراض القلب",PEACH),("تأهيل البلع والطب الطبيعي",SKY),("جراحة العظام",LAV))
        for i,(label,color) in enumerate(labels):
            y=210+i*112; d.rectangle((850,y+8,1155,y+78),fill=color); d.text((1002,y+43),ar(label),font=F16,fill=INK,anchor="mm")
    elif index==4:
        en.card(d,(775,190,1165,510),WHITE,28); d.text((1120,235),ar("مسار رعايتك"),font=F13,fill=TEAL,anchor="ra")
        for i,item in enumerate(("مراجعة الاستشاري","الخطوة الطبية المقترحة","الترتيبات المتوقعة")):
            y=300+i*70; d.ellipse((1090,y-16,1122,y+16),fill=PALE); d.line((1099,y,1109,y+10,1118,y-10),fill=TEAL,width=4); d.text((1068,y),ar(item),font=F16,fill=INK,anchor="rm")
    elif index==5:
        d.rectangle((735,396,1225,535),fill=CREAM)
        for i,label in enumerate(("التأشيرة","الاستقبال","الإقامة")): d.text((944+i*105,420),ar(label),font=F13,fill=INK,anchor="mm")
        d.text((1035,505),ar("اختياري · مخصص · منظم"),font=F16,fill=TEAL,anchor="mm")
    elif index==6:
        d.rectangle((1040,505,1210,548),fill=CREAM); d.text((1125,530),ar("الاستشاري المعالج"),font=F13,fill=INK,anchor="mm")

def enhance(d,index,t):
    progress=(index+min(t/SCENE_LEN,1))/8; dot_x=90+1100*progress
    pulse=13+5*(1+math.sin(t*3))/2
    d.ellipse((dot_x-pulse,657-pulse,dot_x+pulse,657+pulse),outline=AQUA,width=3)
    d.ellipse((dot_x-7,650,dot_x+7,664),fill=CORAL)
    phase=int(t*2)%4
    colors=(AQUA,CORAL,"#9E91CE",TEAL)
    for i,(x,y) in enumerate(((770,160),(1200,180),(745,535),(1190,560))):
        sparkle(d,x,y,3+(i+phase)%3,colors[i])
    ring=142+8*math.sin(t*1.8)
    d.ellipse((980-ring,350-ring,980+ring,350+ring),outline="#65BDB540",width=3)

def story_characters(d,index,t):
    bob=math.sin(t*2)*3
    if index==0:
        character(d,760,430+bob,"patient",.72); bubble(d,(655,270,800,335),"هذه تقاريري",PEACH,"right")
    elif index==1:
        character(d,735,455+bob,"patient",.68); bubble(d,(650,285,790,345),"إرسال آمن",PALE,"right")
    elif index==2:
        character(d,770,440+bob,"patient",.68); bubble(d,(650,270,795,335),"ماذا ينقصني؟",PEACH,"right")
        bubble(d,(1035,270,1190,335),"سأرتب كل شيء",PALE,"left")
    elif index==3:
        d.rectangle((740,185,1225,560),fill=CREAM)
        en.card(d,(770,215,1190,510),WHITE,26)
        d.line((980,245,980,465),fill=LINE,width=2)
        character(d,875,390+bob,"patient",.85); character(d,1080,390-bob,"consultant",.85)
        d.text((875,475),ar("المريض"),font=F13,fill=BODY,anchor="mm"); d.text((1080,475),ar("الاستشاري"),font=F13,fill=BODY,anchor="mm")
        bubble(d,(805,245,945,305),"أشرح حالتي",PEACH,"right"); bubble(d,(1010,245,1150,305),"نراجعها معًا",SKY,"left")
        for i,c in enumerate((CORAL,AQUA,"#9E91CE")): d.ellipse((930+i*50,525,946+i*50,541),fill=c)
    elif index==4:
        character(d,735,455+bob,"patient",.62); bubble(d,(640,285,770,350),"الآن أفهم",PALE,"right")
    elif index==5:
        character(d,750,455+bob,"patient",.62); en.rr(d,(780,430,820,475),8,INK); d.line((790,430,790,413,810,413,810,430),fill=INK,width=3)
    elif index==6:
        character(d,730,455+bob,"patient",.62); bubble(d,(635,275,780,338),"أنا مستعد",PEACH,"right")
        bubble(d,(1045,275,1190,338),"سنشرح كل خطوة",SKY,"left")
    elif index==7:
        character(d,730,450+bob,"patient",.66); bubble(d,(620,270,790,338),"شكرًا على المتابعة",PEACH,"right")

def frame(index,t):
    im=en.frame(index,t)
    d=arabic_header(im,index,t)
    translate_visual_labels(d,index)
    story_characters(d,index,t)
    enhance(d,index,t)
    return im

def end_frame(t=0):
    im=Image.new("RGB",(W,H),CREAM); d=ImageDraw.Draw(im,"RGBA")
    d.ellipse((-90,-110,470,450),fill=PALE); d.ellipse((920,330,1400,830),fill=PEACH)
    fade=en.ease(t/2); trio_y=300-int(20*fade)
    character(d,470,trio_y,"patient",.68); character(d,640,trio_y,"coordinator",.68); character(d,810,trio_y,"consultant",.68)
    d.line((520,trio_y,590,trio_y),fill=AQUA,width=5); d.line((690,trio_y,760,trio_y),fill=AQUA,width=5)
    logo=Image.open(PUBLIC/"brand"/"icon.png").convert("RGBA").resize((112,112)); im.paste(logo,(584,55),logo); d=ImageDraw.Draw(im,"RGBA")
    d.text((640,190),ar("رحلة شفاء"),font=F42,fill=INK,anchor="mm")
    d.text((640,420),ar("وضوح قبل السفر"),font=F30,fill=INK,anchor="mm"); d.text((640,465),ar("دعم في كل خطوة"),font=F30,fill=INK,anchor="mm")
    rr(d,(470,515,810,580),18,TEAL); d.text((640,548),ar("ابدأ مراجعة حالتي"),font=F20,fill=WHITE,anchor="mm")
    d.text((640,630),ar("تنسيق للرعاية · ليست خدمة طوارئ"),font=F13,fill=BODY,anchor="mm")
    for i in range(7): sparkle(d,430+i*70,570+8*math.sin(t*2+i),3,AQUA if i%2 else CORAL)
    return im

def render():
    OUT.mkdir(parents=True,exist_ok=True); video=OUT/"rehletshifaa-journey-ar.mp4"; poster=OUT/"rehletshifaa-journey-ar-poster.jpg"
    cmd=[imageio_ffmpeg.get_ffmpeg_exe(),"-y","-f","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-an","-vcodec","libx264","-preset","medium","-crf","21","-pix_fmt","yuv420p","-movflags","+faststart",str(video)]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE); total=(ENTRY_LEN+len(SCENES)*SCENE_LEN+EXIT_LEN)*FPS
    for n in range(total):
        sec=n/FPS
        if sec<ENTRY_LEN: im=entry_frame(sec)
        elif sec<ENTRY_LEN+len(SCENES)*SCENE_LEN:
            journey_sec=sec-ENTRY_LEN; im=frame(int(journey_sec//SCENE_LEN),journey_sec%SCENE_LEN)
        else: im=end_frame(sec-ENTRY_LEN-len(SCENES)*SCENE_LEN)
        if n==(ENTRY_LEN+4*SCENE_LEN)*FPS+40: im.save(poster,quality=91,optimize=True)
        p.stdin.write(im.tobytes())
        if n%(FPS*7)==0: print(f"Rendered {sec:.0f}/{total/FPS:.0f}s",flush=True)
    p.stdin.close(); result=p.wait()
    if result: raise SystemExit(result)
    print(video)

if __name__=="__main__": render()
