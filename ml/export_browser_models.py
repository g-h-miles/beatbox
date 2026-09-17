"""Lossless export of frozen browser-trained SVMs. No fitting or model selection."""
import hashlib,json,pickle
from pathlib import Path
import numpy as np
TARGET=Path('src/research-browser-model');OUT=Path('artifacts/browser-model-parity')
TARGET.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
manifest=json.loads(Path('artifacts/four-relative/native-manifest.json').read_text())
rows=[];groups=[]
for row in manifest['rows']:
 x=np.fromfile(Path('artifacts/four-relative')/f"{row['stem']}-native.f32",dtype='<f4').reshape(-1,1104)
 assert len(x)==len(row['nativeTimes'])
 groups.append({'file':row['file'],'offset':sum(len(v) for v in rows),'count':len(x)});rows.append(x)
x=np.concatenate(rows);x.astype('<f4').tofile(OUT/'features.f32')
fixtures={'vectors':[],'models':{}};indices=set()
results={}
for count,classes in [(3,['hat','kick','snare']),(4,['closed','open','kick','snare'])]:
 path=Path(f'artifacts/browser-relative/browser-relative-{count}.pkl');pipeline=pickle.load(path.open('rb'));scaler,svm=pipeline.steps[0][1],pipeline.steps[1][1]
 assert list(svm.classes_)==list(range(count));assert svm.support_vectors_.shape[1]==1104
 assert np.array_equal(svm.support_vectors_,svm.support_vectors_.astype(np.float32).astype(np.float64))
 sections={};chunks=[];offset=0
 for name,array,dtype in [('mean',scaler.mean_,'<f8'),('scale',scaler.scale_,'<f8'),('supports',svm.support_vectors_,'<f4'),('dual',svm.dual_coef_,'<f8'),('intercepts',svm.intercept_,'<f8')]:
  while offset%8:chunks.append(b'\0');offset+=1
  value=np.asarray(array,dtype=dtype);data=value.tobytes();sections[name]={'offset':offset,'length':value.size,'dtype':'f32' if dtype.endswith('4') else 'f64'};chunks.append(data);offset+=len(data)
 binary=b''.join(chunks);(TARGET/f'model{count}.bin').write_bytes(binary)
 metadata={'format':'beatbox-browser-svm-v1','classes':classes,'featureCount':1104,'supportCount':len(svm.support_vectors_),'supportCounts':svm.n_support_.tolist(),'gamma':float(svm._gamma),'byteLength':len(binary),'sha256':hashlib.sha256(binary).hexdigest(),'sourcePickleSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sections':sections,'training':'Frozen public AVP1–14 annotated training grooves with native browser preprocessing; no private data','source':'https://zenodo.org/records/3250230','license':'AVP CC BY4.0. Attribution retained for derived model.'};(TARGET/f'model{count}.json').write_text(json.dumps(metadata,indent=2))
 predicted=pipeline.predict(x);svm.decision_function_shape='ovo';margins=svm.decision_function(scaler.transform(x));assert margins.shape==(len(x),count*(count-1)//2)
 results[count]={'labels':predicted.tolist(),'pairScores':margins.tolist()};(OUT/f'reference{count}.json').write_text(json.dumps(results[count]))
 for k in range(count):indices.add(int(np.flatnonzero(predicted==k)[0]))
 print(f'model{count}: {len(binary)} bytes; {len(x)} reference predictions',flush=True)
indices=sorted(indices|set(np.linspace(0,len(x)-1,12,dtype=int).tolist()))
fixtures['vectors']=x[indices].tolist()
for count in [3,4]:fixtures['models'][str(count)]={k:[v[i] for i in indices] for k,v in results[count].items()}
Path('tests/browser-model-fixture.json').write_text(json.dumps(fixtures,separators=(',',':')))
(OUT/'manifest.json').write_text(json.dumps({'events':len(x),'features':1104,'groups':groups,'protocol':'Numerical parity on all cached native validation events, not an accuracy evaluation.'},indent=2))
