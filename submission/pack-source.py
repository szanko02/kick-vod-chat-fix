"""Build the review source archive from an explicit public-file allow-list."""
import hashlib
import json
from pathlib import Path
import zipfile

root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'extension'/'manifest.json').read_text(encoding='utf-8'))
target=root/'dist'/('kick-vod-chat-fix-'+manifest['version']+'-source.zip')
target.parent.mkdir(exist_ok=True)
files=[]
for folder in ['extension','tests','scripts']:
    files.extend(p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
for name in ['.gitignore','.gitattributes','README.md','LICENSE','package.json','package-lock.json',
             'submission/privacy-policy.txt','submission/reviewer-notes.txt',
             'submission/validation.md','submission/firefox-results.json','submission/listing.json','submission/pack-source.py']:
    path=root/name
    if path.is_file():
        files.append(path)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for path in sorted(set(files),key=lambda p:p.relative_to(root).as_posix()):
        entry=zipfile.ZipInfo(path.relative_to(root).as_posix(),date_time=(2026,1,1,0,0,0))
        entry.compress_type=zipfile.ZIP_DEFLATED
        entry.external_attr=0o644<<16
        archive.writestr(entry,path.read_bytes())
print(json.dumps({'path':str(target),'bytes':target.stat().st_size,
                  'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'files':len(files)}))
