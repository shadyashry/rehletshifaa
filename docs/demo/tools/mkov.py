import json
from PIL import Image, ImageDraw
rects=json.load(open('fr2/rects.json'))
for i,hs in rects.items():
    for j,r in enumerate(hs):
        w,h=r['w'],r['h']; im=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(im)
        d.rounded_rectangle((0,0,w-1,h-1),radius=8,outline=(224,122,95,255),width=3)
        im.save(f'ov/o{int(i):02d}_{j}.png')
