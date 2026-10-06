import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
rows=[]
for path in sorted((root/'work'/'firefox-qa').glob('*.json')):
    if path.stem not in ['baseline-3min','release-verified','final-package']:
        continue
    data=json.loads(path.read_text(encoding='utf-8'))
    samples=data.get('samples',[])
    ages=[]
    buffers=[]
    for s in samples:
        v=s.get('video') or {}
        c=s.get('chat') or {}
        if v.get('time',0)<30:
            continue
        stamp=c.get('lastTime')
        if stamp:
            seconds=0
            for part in stamp.split(':'):
                seconds=seconds*60+int(part)
            ages.append(v['time']-seconds)
        for raw in s.get('metrics',{}).values():
            try:
                metric=json.loads(raw)
                if isinstance(metric.get('bufferMs'),(int,float)):
                    buffers.append(metric['bufferMs']/1000)
            except (ValueError,TypeError):
                pass
    ordered=sorted(ages)
    rows.append({'label':path.stem,'version':data.get('firefoxVersion'),
      'samples':len(samples),'error':(data.get('error') or '').split('\n')[0] or None,
      'lastMessageAgeMaxSeconds':round(max(ages),2) if ages else None,
      'lastMessageAgeP95Seconds':round(ordered[int((len(ordered)-1)*.95)],2) if ordered else None,
      'bufferMinSeconds':round(min(buffers),2) if buffers else None,
      'bufferMaxSeconds':round(max(buffers),2) if buffers else None,
      'chatRendered':any((s.get('chat') or {}).get('rows',0)>0 for s in samples),
      'artifactSha256':data.get('artifactSha256'),
      'exercises':[{'name':e['name'],
          'videoReady':bool((e.get('after',{}).get('video') or {}).get('ready',0)>=2),
          'bufferObserved':bool(e.get('after',{}).get('metrics'))}
          for e in data.get('exercises',[])]})
(root/'submission'/'firefox-results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
print(json.dumps(rows,indent=2))
