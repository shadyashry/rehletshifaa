from PIL import Image, ImageFilter
D='.demo-shots/'; O='docs/demo/assets/'
SARA=(1008,384,1125,408); ALA=(1000,630,1150,654)
jobs=[
 ('01-home','home',(0,0,1440,960),[]),
 ('02-intake','intake',(110,100,1330,1360),[]),
 ('03-received','received',(200,130,1240,960),[]),
 ('04-my-work','my-work',(0,0,1440,780),[]),
 ('05-case-prepare','case-prepare',(110,0,1330,720),[]),
 ('06-consultant-review','case-review',(110,100,1330,1100),[(425,258,520,284)]),
 ('07-estimate-ready','patient-proposal-ready',(110,100,1330,1330),[SARA,ALA]),
 ('08-verify','verify',(200,100,1240,660),[]),
 ('09-deposit','patient-pay-deposit',(110,330,1330,1960),[SARA,ALA]),
 ('10-deposit-paid','patient-deposit-paid',(110,280,1330,1180),[SARA,ALA]),
 ('11-admission','case-treat',(110,540,1040,1070),[(138,632,268,658)]),
 ('12-treatment','case-treat',(110,1075,1040,1700),[]),
 ('13-discharge','case-follow',(110,540,1040,1560),[]),
 ('14-follow-up','case-follow',(110,2120,1040,2560),[]),
]
for n,f,box,bl in jobs:
    im=Image.open(D+f+'.png').convert('RGB')
    for b in bl: im.paste(im.crop(b).filter(ImageFilter.GaussianBlur(9)),b[:2])
    c=im.crop(box); c.save(O+n+'.webp','WEBP',quality=84,method=6); print(n,c.size)
