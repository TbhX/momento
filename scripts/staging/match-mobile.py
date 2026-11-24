from playwright.sync_api import sync_playwright
import mimetypes
import shutil
from pathlib import Path
root=Path('src/client').resolve()
from urllib.parse import urlparse
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('google-chrome') or shutil.which('chromium'),args=['--no-sandbox','--disable-dev-shm-usage'])
 for w,h in [(320,568),(844,390)]:
  pg=b.new_page(viewport={'width':w,'height':h},has_touch=True)
  def serve(r):
   u=urlparse(r.request.url); path=u.path
   if u.hostname!='momento.test':return r.abort()
   if path.startswith('/api/'):
    d={'/api/me':{'accountRef':'fixture','persistence':'supabase','profile':{'name':'Camille','age':29,'city':'Paris','gender':'unspecified'}},'/api/service/status':{'admin':False,'moderator':False,'premium':False,'readiness':{'enabled':False}},'/api/auth/config':{'mode':'supabase','configured':True,'providers':[]}}
    return r.fulfill(json=d.get(path,{}))
   file=root/path.strip('/')
   if file.is_dir():file=file/'index.html'
   if not file.is_file():return r.fulfill(status=404,body='')
   r.fulfill(path=file,content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
  pg.route('**/*',serve);pg.goto('http://momento.test')
  pg.wait_for_function('typeof accountReady !== "undefined" && accountReady',timeout=6000)
  pg.evaluate("async()=>{await go('callDemo');callAudienceLocal();document.querySelector('#callChoiceGender').value='all';callSetupConfirm();callDemoStart();callSessionPeerArrived();callDemoLike();callDemoPeerLike(true)}")
  panel=pg.locator('#callMomentPanel');panel.wait_for()
  metrics=panel.evaluate("""n=>{let stage=document.querySelector('.conversation-view .call-stage'),r=n.getBoundingClientRect(),s=stage.getBoundingClientRect();return {title:n.querySelector('h3').textContent,overVideo:r.left<s.right&&r.right>s.left&&r.top<s.bottom&&r.bottom>s.top,width:r.width,scroll:n.scrollHeight,client:n.clientHeight}}""")
  print(w,h,metrics,flush=True)
  assert metrics["title"]=="C’est un match !" and not metrics["overVideo"] and metrics["width"]<=w
  panel.locator('summary').click(timeout=3000);panel.locator('[data-moment-action=dismiss]').click(timeout=3000);assert not panel.count()
  pg.close()
