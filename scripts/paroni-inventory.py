"""Download and integrity-check author-labeled public audio; never infer or train."""
import hashlib,json,urllib.request,wave
from pathlib import Path
OUT=Path('artifacts/new-public-audio/paroni');OUT.mkdir(parents=True,exist_ok=True)
URL='https://zenodo.org/api/records/4264747'
def main():
 metadata=json.load(urllib.request.urlopen(URL,timeout=30))
 assert metadata['metadata']['license']['id']=='cc-by-4.0'
 (OUT/'metadata.json').write_text(json.dumps(metadata,indent=2))
 selected=[f for f in metadata['files'] if f['key'].endswith('_au.wav')]
 rows=[]
 for f in selected:
  assert Path(f['key']).name==f['key']
  path=OUT/f['key']
  if not path.exists():path.write_bytes(urllib.request.urlopen(f['links']['self'],timeout=60).read())
  data=path.read_bytes();assert len(data)==f['size'];assert 'md5:'+hashlib.md5(data).hexdigest()==f['checksum']
  with wave.open(str(path),'rb') as w:
   info={'rate':w.getframerate(),'channels':w.getnchannels(),'frames':w.getnframes(),'sampleWidth':w.getsampwidth(),'duration':w.getnframes()/w.getframerate()}
  rows.append({'file':f['key'],'source':f['links']['self'],'bytes':len(data),'md5':f['checksum'],'sha256':hashlib.sha256(data).hexdigest(),**info})
  print(f['key'],info,flush=True)
 report={'source':URL,'doi':'10.5281/zenodo.4264747','license':'CC-BY-4.0','status':'Inventory only; no inference, feature extraction, model fitting, waveform interpretation, or event annotations. Newly obtained public author-labeled clips reserved pending scope review.','files':rows,'totalDuration':sum(r['duration'] for r in rows)}
 (OUT/'inventory.json').write_text(json.dumps(report,indent=2));print('Downloaded',len(rows),'files; all sourceMD5checks pass',flush=True)
if __name__=='__main__':main()
