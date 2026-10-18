from PIL import Image
im = Image.open(r'D:\Datum\nuclearBomb\Motion\肥鱼爱大米\proto\ref_front_full.png')
print(im.size)
# front full 1421x1800. Crop torso area. Find bounds visually: body ~ x 380..1050, y 900..1500
im.crop((380, 880, 1080, 1520)).resize((700*2//2, 640)).save(r'proto/_crop_torso.png')
im2 = Image.open(r'D:\Datum\nuclearBomb\Motion\肥鱼爱大米\proto\ref_body_front.png')
print(im2.size)
im2.crop((250, 100, 950, 750)).save(r'proto/_crop_bodice.png')
im3 = Image.open(r'D:\Datum\nuclearBomb\Motion\肥鱼爱大米\proto\ref_side_full.png')
print(im3.size)
im3.crop((60, 780, 900, 1500)).save(r'proto/_crop_side.png')
