"""Export public frozen relative SVM and independent numerical/audio fixtures.

No fitting; no private data. Supports were originally float32 features and are
stored losslessly as float32. Small scaler/dual/intercept arrays retain float64.
"""
import json,pickle,hashlib
from pathlib import Path
import numpy as np
import soundfile as sf
import librosa,torch
from scipy.fft import dct
from torchaudio.compliance import kaldi
from prepare import crop,fbank
from neural_crop_evaluate import features
OUT=Path('artifacts/relative-parity');TARGET=Path('src/research-relative');OUT.mkdir(parents=True,exist_ok=True);TARGET.mkdir(parents=True,exist_ok=True)

def main():
 pipeline=pickle.load(open('artifacts/core-model/relative.pkl','rb'));scaler,svm=pipeline.steps[0][1],pipeline.steps[1][1];sections={};chunks=[];offset=0
 for name,array,dtype in [('mean',scaler.mean_,'<f8'),('scale',scaler.scale_,'<f8'),('supports',svm.support_vectors_,'<f4'),('dual',svm.dual_coef_,'<f8'),('intercepts',svm.intercept_,'<f8')]:
  while offset%8:chunks.append(b'\0');offset+=1
  value=np.asarray(array,dtype=dtype);data=value.tobytes();sections[name]={'offset':offset,'length':value.size,'dtype':'f32' if dtype.endswith('4') else 'f64'};chunks.append(data);offset+=len(data)
 assert np.array_equal(svm.support_vectors_,svm.support_vectors_.astype(np.float32).astype(np.float64))
 binary=b''.join(chunks);(TARGET/'relative-model.bin').write_bytes(binary)
 meta={'format':'beatbox-relative-svm-binary-v1','classes':['hat','kick','snare'],'features':1104,'supportCount':len(svm.support_vectors_),'supportCounts':svm.n_support_.tolist(),'gamma':float(svm._gamma),'byteLength':len(binary),'sha256':hashlib.sha256(binary).hexdigest(),'sections':sections,'training':'Public AVP performers1–14 annotated grooves only; no private audio','source':'https://zenodo.org/records/3250230','license':'AVP CC BY4.0; research model, only3coreclasses'};(TARGET/'model.json').write_text(json.dumps(meta,indent=2))
 mel,_=kaldi.get_mel_banks(128,512,16000,20,0,100,-500,1);window=kaldi._feature_window_function('povey',400,.42,torch.device('cpu'),torch.float32)
 settings={'sampleRate':16000,'cropSamples':8000,'frameSamples':400,'hop':160,'fft':512,'bands':128,'frames':48,'window':window.tolist(),'mel':[[[int(i),float(row[i])] for i in np.flatnonzero(row.numpy())] for row in mel],'dct':[[float(np.sqrt(2/128)*np.cos(np.pi*k*(n+.5)/128)) for n in range(128)] for k in range(1,21)]};(TARGET/'settings.json').write_text(json.dumps(settings,separators=(',',':')))
 # Full cached-event parity is numeric equivalence, never an accuracy evaluation.
 rows=json.loads(Path('artifacts/ml-v2/events.json').read_text());bank=np.load('artifacts/ml-v2/fbanks.npy').astype(np.float32);parts=[]
 for lo,hi in [(0,2),(2,10),(10,25),(0,10)]:
  z=bank[:,lo:hi];a=z.mean(1);parts.extend([a-a.mean(1,keepdims=True),z.std(1),dct(a,type=2,norm='ortho')[:,1:21]])
 raw=np.concatenate(parts,axis=1);x=raw.copy();groups=[]
 for file in sorted(set(r['file'] for r in rows)):
  for kind in ['annotation','detection']:
   ix=[i for i,r in enumerate(rows) if r['file']==file and r['kind']==kind]
   if ix:x[ix]=(x[ix]-np.median(x[ix],0))/(np.std(x[ix],0)+.1);groups.append(ix)
 raw.astype('<f4').tofile(OUT/'cached-raw-features.f32');x.astype('<f4').tofile(OUT/'cached-relative-features.f32');predicted=pipeline.predict(x);predicted.astype('uint8').tofile(OUT/'cached-labels.u8');(OUT/'cached-groups.json').write_text(json.dumps(groups));print('Cached parity reference',len(x),flush=True)
 seqrows=json.loads(Path('artifacts/core-model/sequence/records.json').read_text());seq=np.load('artifacts/core-model/sequence/sequences.npz');records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())};fixtures=[]
 for filename in ['P1_Improvisation_Fixed.wav','P8_Improvisation_Personal.wav'] + [r['file'] for r in seqrows if r['split']=='validation']:
  r=records[filename];s=next(s for s in seqrows if s['file']==filename);times=seq[f"t{s['index']}"];original,rate=sf.read(r['path'],always_2d=True,dtype='float32');original=original.mean(1);audio=librosa.resample(original,orig_sr=rate,target_sr=16000);banks=np.stack([fbank(crop(audio,t,times[i+1] if i+1<len(times) else len(audio)/16000)) for i,t in enumerate(times)]).astype('float32');rawfeatures=[]
  for b in banks:
   p=[]
   for lo,hi in [(0,2),(2,10),(10,25),(0,10)]:
    a=b[lo:hi].mean(0);p.extend([a-a.mean(),b[lo:hi].std(0),dct(a,type=2,norm='ortho')[1:21]])
   rawfeatures.append(np.concatenate(p))
  stem=filename[:-4];audio.astype('<f4').tofile(OUT/f'{stem}-16k.f32');original.astype('<f4').tofile(OUT/f'{stem}-native.f32');banks.astype('<f4').tofile(OUT/f'{stem}-banks.f32');np.stack(rawfeatures).astype('<f4').tofile(OUT/f'{stem}-raw.f32');fixtures.append({'file':filename,'stem':stem,'sampleRate':rate,'times':times.tolist(),'expected':pipeline.predict(features(banks,relative=True)).tolist(),'split':s['split'],'truth':[{'time':a['time'],'class':{'hhc':0,'hho':0,'kd':1,'sd':2}[a['label']]} for a in r['annotations'] if a['label'] in ['hhc','hho','kd','sd']]})
 unit_reference(x,predicted)
 (OUT/'audio-fixtures.json').write_text(json.dumps(fixtures,indent=2));print('Exported',len(binary),'modelbytes;',sum(len(f['times']) for f in fixtures),'real audio events',flush=True)
def unit_reference(x,predicted):
 n=np.arange(8000);audio=((.3*np.sin(2*np.pi*440*n/16000)+.08*np.sin(2*np.pi*4100*n/16000))*np.exp(-n/1300)+.03).astype('float32');audio[700]+=.6
 bank=fbank(crop(audio,.01,.5)).astype('float32');parts=[]
 for lo,hi in [(0,2),(2,10),(10,25),(0,10)]:
  a=bank[lo:hi].mean(0);parts.extend([a-a.mean(),bank[lo:hi].std(0),dct(a,type=2,norm='ortho')[1:21]])
 indices=[int(np.flatnonzero(predicted==k)[0]) for k in range(3)]
 fixture={'bank':bank.ravel().tolist(),'features':np.concatenate(parts).tolist(),'vectors':[x[i].tolist() for i in indices],'labels':[int(predicted[i]) for i in indices]}
 Path('tests/relative-fixture.json').write_text(json.dumps(fixture,separators=(',',':')))

if __name__=='__main__':main()
