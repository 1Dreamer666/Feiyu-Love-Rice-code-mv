from PIL import Image
im = Image.open(r'D:\Datum\nuclearBomb\Motion\肥鱼爱大米\proto\ref_body_front.png')
# gold embroidery band zoom
im.crop((250, 480, 900, 650)).resize((1300, 340)).save(r'proto/_crop_gold.png')
# petticoat zoom
im.crop((280, 600, 900, 760)).resize((1240, 320)).save(r'proto/_crop_petti.png')
im2 = Image.open(r'D:\Datum\nuclearBomb\Motion\肥鱼爱大米\proto\ref_back_full.png')
im2.crop((200, 1350, 900, 1750)).resize((1400, 800)).save(r'proto/_crop_back.png')
