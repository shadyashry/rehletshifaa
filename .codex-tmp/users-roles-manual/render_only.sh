rm -f render_rev2/*.png
$PY - <<'PYEOF'
import pypdfium2 as pdfium
from PIL import Image
pdf = pdfium.PdfDocument(r'C:\Users\hp\Projects\rehletshifaa\docs\platform-control-plane\rehletshifaa-users-and-roles-manual-rev2.pdf')
pages = [pdf[i].render(scale=1.1).to_pil() for i in range(len(pdf))]
for i, im in enumerate(pages): im.save(f'render_rev2/page-{i+1:02d}.png')
for k in range(0, len(pages), 2):
    ims = pages[k:k+2]
    s = Image.new('RGB', (sum(i.width for i in ims) + 20, max(i.height for i in ims)), 'gray'); x = 0
    for i in ims: s.paste(i, (x, 0)); x += i.width + 20
    s.save(f'render_rev2/sheet-{k//2+1:02d}.png')
print(len(pages), "pages")
PYEOF
