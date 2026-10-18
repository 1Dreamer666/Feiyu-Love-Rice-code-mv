from PIL import Image, ImageDraw
im = Image.open(r'D:\Datum\nuclearBomb\Motion\肥鱼爱大米\proto\ref_front_full.png').convert('RGB')
# crop x 300..1110, y 650..1550
x0,y0,x1,y1 = 300,650,1150,1550
c = im.crop((x0,y0,x1,y1))
d = ImageDraw.Draw(c)
for yy in range(y0, y1, 50):
    col = (255,0,0) if yy % 100 == 0 else (255,150,150)
    d.line([(0, yy-y0), (x1-x0, yy-y0)], fill=col, width=1)
    d.text((4, yy-y0+1), str(yy), fill=(200,0,0))
for xx in range(x0, x1, 50):
    col = (0,120,255) if xx % 100 == 0 else (150,190,255)
    d.line([(xx-x0, 0), (xx-x0, y1-y0)], fill=col, width=1)
    if xx % 100 == 0:
        d.text((xx-x0+2, 2), str(xx), fill=(0,80,200))
c.save(r'proto/_grid_front.png')
