# Test files: a PDF and a photo for import, share and the gallery, and a shared Warrantly list.
import json
from PIL import Image, ImageDraw

pdf = Image.new('RGB', (595, 842), 'white')
ImageDraw.Draw(pdf).text((60, 80), 'INVOICE 2026-0001  Philips HD9350  24 months warranty', fill='black')
pdf.save('fixture-invoice.pdf')
pdf.save('fixture-share.pdf')
Image.new('RGB', (600, 600), (40, 120, 200)).save('fixture-photo.jpg', quality=90)
item = {'warranty': {'product_name': 'Shared Kettle', 'store_name': 'Shop', 'purchase_date': '2026-01-01',
                     'warranty_start_date': '2026-01-01', 'warranty_months': 24}, 'history': [], 'documents': []}
json.dump({'format': 'warrantly-share', 'v': 1, 'items': [item]}, open('fixture-shared.json', 'w'))
