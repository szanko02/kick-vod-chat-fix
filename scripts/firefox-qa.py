"""Isolated Firefox integration QA; never reads or uses the user's profile."""
import argparse
import base64
import hashlib
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work' / 'qa-tools'))
from marionette_driver.marionette import Marionette
from marionette_driver.addons import Addons

parser = argparse.ArgumentParser()
parser.add_argument('--extension')
parser.add_argument('--seconds', type=int, default=20)
parser.add_argument('--label', default='baseline')
parser.add_argument('--exercise', action='store_true')
parser.add_argument('--reload', action='store_true')
parser.add_argument('--port', type=int, default=2891)
parser.add_argument('--debug', action='store_true')
parser.add_argument('--url', default='https://kick.com/maddyson/videos/01a10d48-8960-7f24-aade-189d84b44b61')
args = parser.parse_args()
output = ROOT / 'work' / 'firefox-qa'
output.mkdir(parents=True, exist_ok=True)
prefs={'media.autoplay.default': 0, 'media.volume_scale': 0.0}
test_uuid='ea00f9e4-1ce1-4c92-afd6-7ba196f38a88'
if args.extension:
    addon_manifest=json.loads((ROOT/'extension'/'manifest.json').read_text(encoding='utf-8'))
    prefs['extensions.webextensions.uuids']=json.dumps({addon_manifest['browser_specific_settings']['gecko']['id']:test_uuid})
m = Marionette(bin=r'C:\Program Files\Mozilla Firefox\firefox.exe',
               port=args.port, headless=True, app_args=['-no-remote']+(['--remote-allow-system-access'] if args.debug else []),
               workspace=str(output), gecko_log=str(output / (args.label + '.log')),
               prefs=prefs)
report = {'method': 'Isolated headless Firefox, actual Kick page and native DOM',
          'url': args.url, 'extension': bool(args.extension), 'samples': []}
if args.extension and Path(args.extension).is_file():
    report['artifactSha256']=hashlib.sha256(Path(args.extension).read_bytes()).hexdigest()
sample_script = """
const v=document.querySelector('video'), c=document.querySelector('#chatroom-messages');
const times=c?.innerText.match(/^\\d{2}:\\d{2}(?::\\d{2})?$/gm)||[];
const metrics=Object.fromEntries([...document.documentElement.attributes].filter(a=>a.name.startsWith('data-kcf')).map(a=>[a.name,a.value]));
return {video:v?{time:v.currentTime,paused:v.paused,rate:v.playbackRate,ready:v.readyState,error:v.error?.code||null}:null,
  chat:c?{rows:c.querySelectorAll('[data-index]').length,lastTime:times.at(-1)||null,images:c.querySelectorAll('img').length}:null,
  metrics,notFound:document.body.innerText.includes('We can’t find')||document.body.innerText.includes('Мы не можем найти')};
"""
try:
    m.start_session({'pageLoadStrategy':'eager'})
    report['firefoxVersion'] = m.session.get('browserVersion')
    m.timeout.page_load = 45
    m.timeout.script = 15
    if args.extension:
        report['addonId'] = Addons(m).install(str(Path(args.extension).resolve()), temp=True)
    m.navigate(args.url)
    def wait_for_video(seconds=45):
        for _ in range(seconds):
            state=m.execute_script(sample_script)
            if state['video'] and state['video']['ready'] >= 2:
                return state
            if state['notFound']:
                raise RuntimeError('Kick reports the VOD unavailable')
            time.sleep(1)
        raise RuntimeError('Kick video did not become ready within 45 seconds')
    state=wait_for_video()
    m.execute_script("const v=document.querySelector('video'); if(v){v.muted=true;v.play().catch(()=>{});}")
    if args.debug:
        report['loadedScripts']=m.execute_script("return [...document.scripts].filter(s=>s.src).map(s=>s.src);")
        with m.using_context(m.CONTEXT_CHROME):
            report['console']=m.execute_script("return Services.console.getMessageArray().map(x=>x.message||'').filter(x=>/moz-extension|kick|webRequest|ReferenceError|TypeError/i.test(x)).slice(-12).map(x=>x.slice(0,1400));")
            report['policy']=m.execute_script("const p=WebExtensionPolicy.getByID(arguments[0]);return p?{active:p.active,permissions:[...p.permissions],hostname:p.mozExtensionHostname}:null;",script_args=[report.get('addonId')])
        print(json.dumps({'debug':args.label,'policy':report['policy'],'console':report['console']}),flush=True)
    for i in range(args.seconds):
        time.sleep(1)
        report['samples'].append(m.execute_script(sample_script))
        if args.extension and i >= 30 and not report['samples'][-1]['metrics']:
            raise RuntimeError('No patched buffer diagnostics after 30 seconds of playback')
        if i % 30 == 29:
            print(json.dumps({'label':args.label,'elapsed':i+1,'state':report['samples'][-1]}),flush=True)
    if args.exercise:
        report['exercises'] = []
        def exercise(name, script, seconds=6):
            before=m.execute_script(sample_script)
            m.execute_script(script)
            time.sleep(seconds)
            after=m.execute_script(sample_script)
            report['exercises'].append({'name':name,'before':before,'after':after})
            print(json.dumps({'exercise':name,'after':after}),flush=True)
        exercise('pause',"document.querySelector('video').pause();")
        exercise('resume',"document.querySelector('video').play();")
        exercise('backward-10sec',"const v=document.querySelector('video');v.currentTime=Math.max(0,v.currentTime-10);")
        exercise('forward-60sec',"const v=document.querySelector('video');v.currentTime+=60;")
        exercise('rate-2x',"document.querySelector('video').playbackRate=2;",20)
    if args.exercise or args.reload:
        report.setdefault('exercises', [])
        m.navigate(args.url)
        wait_for_video()
        time.sleep(12)
        report['exercises'].append({'name':'cached-reload','after':m.execute_script(sample_script)})
    report['chatRendered'] = m.execute_script("return !!document.querySelector('#chatroom-messages [data-index]');")
    if args.extension and not any(s.get('metrics') for s in report['samples']):
        raise RuntimeError('Patched buffer diagnostics were never observed')
    (output / (args.label + '.png')).write_bytes(base64.b64decode(m.screenshot()))
    if args.extension:
        popup=m.open(type='tab',focus=False)
        m.switch_to_window(popup['handle'],focus=False)
        m.navigate('moz-extension://'+test_uuid+'/popup.html')
        time.sleep(2)
        report['popupText']=m.execute_script('return document.body.innerText;')
        body=m.find_element('tag name','body')
        (output/(args.label+'-popup.png')).write_bytes(base64.b64decode(m.screenshot(element=body)))
    print(json.dumps({'label': args.label, 'version':report['firefoxVersion'],
                      'addonId':report.get('addonId'),'last':report['samples'][-1] if report['samples'] else state}),flush=True)
except Exception as e:
    report['error']=str(e)
    print(json.dumps({'label':args.label,'error':str(e)}),flush=True)
    try:
        (output/(args.label+'-failure.png')).write_bytes(base64.b64decode(m.screenshot()))
    except Exception:
        pass
    raise
finally:
    (output / (args.label + '.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
    try:
        m.quit()
    except Exception:
        pass
    m.cleanup()
    m.instance = None
