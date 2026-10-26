"""Render Momento's existing brand system to crawler-friendly PNGs.
Local design utility; Inkscape is not required by the Pages build.
"""
import base64, html, subprocess, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
logo=base64.b64encode((root/'src/client/momento-logo.png').read_bytes()).decode()
cards={
 'home':('UN BONJOUR PEUT TOUT CHANGER.', ['Le feeling commence', 'par un bonjour.']),
 'music':('LA TABLE MUSIQUE', ['Sur la même', 'fréquence.']),
 'nearby':('LA TABLE À PROXIMITÉ', ['Un bonjour', 'à deux pas.']),
 'culture':('LA TABLE CULTURE', ['Des histoires', 'à partager.']),
 'travel':('LA TABLE VOYAGES', ['La prochaine', 'escale.']),
 'astrology':('LA TABLE ASTRO', ['Sous une', 'bonne étoile.']),
 'sport':('LA TABLE SPORT', ['La bonne', 'énergie.']),
 'profession':('LA TABLE UNIVERS PRO', ['Au-delà', 'des projets.']),
}
for slug,(eyebrow,lines) in cards.items():
 for kind,w,h in [('link',1200,630)]+([('square',1080,1080),('story',1080,1920)] if slug=='home' else []):
  tall=kind!='link'; cx=w/2; y=260 if not tall else (500 if kind=='story' else 365); lw=470 if not tall else 620
  text=''.join(f'<text x="{cx}" y="{y+92+i*72}" text-anchor="middle" font-family="DejaVu Sans" font-size="58" letter-spacing="-2" fill="#3b3046">{html.escape(line)}</text>' for i,line in enumerate(lines))
  svg=f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#fbeaf2"/><stop offset=".52" stop-color="#fbf8fc"/><stop offset="1" stop-color="#e5effc"/></linearGradient></defs><rect width="{w}" height="{h}" fill="url(#bg)"/><circle cx="{cx}" cy="{h/2}" r="{w*.45}" fill="none" stroke="#e3d8e8" stroke-width="2"/><circle cx="{cx}" cy="{h/2}" r="{w*.39}" fill="none" stroke="#fff" stroke-width="2"/><circle cx="{cx-w*.36}" cy="{h/2-w*.27}" r="18" fill="#eda7c4"/><circle cx="{cx+w*.37}" cy="{h/2+w*.26}" r="18" fill="#a5c5ec"/><image x="{cx-lw/2}" y="{y-205}" width="{lw}" height="{lw/3}" xlink:href="data:image/png;base64,{logo}"/><text x="{cx}" y="{y}" text-anchor="middle" font-family="DejaVu Sans" font-size="17" letter-spacing="3" fill="#8b6383">{eyebrow}</text>{text}<text x="{cx}" y="{y+268}" text-anchor="middle" font-family="DejaVu Sans" font-size="22" fill="#6b5e76">Une voix. Un regard. Une rencontre.</text><text x="{cx}" y="{y+310}" text-anchor="middle" font-family="DejaVu Sans" font-size="16" fill="#7b6c83">Speed dating en audio et vidéo · 18+</text></svg>'''
  with tempfile.TemporaryDirectory() as d:
   source=Path(d)/'card.svg';source.write_text(svg)
   dest=root/'src/client'/f'share-{slug}-{kind}-v1.png'
   subprocess.run(['inkscape',str(source),'--export-type=png','--export-filename='+str(dest)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   print(dest.name,dest.stat().st_size)
