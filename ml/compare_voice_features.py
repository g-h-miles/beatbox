"""Choose voice descriptors on training blocks; report previously inspected take 2."""
import argparse,json
from pathlib import Path
import numpy as np
import torch
import librosa
from prepare import crop, fbank
from train_voice_metric import VoiceMetric
import soundfile as sf
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler,Normalizer,FunctionTransformer
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import confusion_matrix
from isolated_segments import segment_isolated
from librosa_segments import segment_calibration
from attack_window import attack_window
from voice_features import describe

CLASSES=['kick','closed','open','ride','crash','snare','aux']

def main():
 p=argparse.ArgumentParser();p.add_argument('manifest',type=Path);p.add_argument('--extra-training',type=Path,action='append',default=[]);p.add_argument('--librosa',action='store_true');a=p.parse_args()
 manifest=json.loads(a.manifest.read_text()); vectors={};rows=[];excluded=[]
 torch.set_num_threads(4)
 metric=VoiceMetric().eval();metric.load_state_dict(torch.load('artifacts/ml-v2/voice-metric.pt',map_location='cpu',weights_only=True))
 recordings=[(a.manifest.parent,r) for r in manifest['recordings']]
 for extra in a.extra_training:
  recordings.extend((extra.parent,r) for r in json.loads(extra.read_text())['recordings'] if r['split']=='training')
 check_hashes={r['pcmSha256'] for r in manifest['recordings'] if r['split']=='holdout'}
 if any(r['split']=='training' and r['pcmSha256'] in check_hashes for _,r in recordings):raise ValueError('Training/check audio overlap.')
 seen=set()
 for directory,rec in recordings:
  if rec['pcmSha256'] in seen:continue
  seen.add(rec['pcmSha256'])
  audio,rate=sf.read(directory/rec['file'],dtype='float32')
  segs=segment_calibration(audio,rate) if a.librosa else segment_isolated(audio,rate)
  for candidate in ([] if a.librosa else segment_isolated(audio,rate,minimum_relative_peak=0)):
   if not any(abs(candidate['start']-kept['start'])<.001 for kept in segs):
    excluded.append({'file':rec['file'],'split':rec['split'],'reason':'low relative energy; may include a real soft hit; not scored',**candidate})
  for i,seg in enumerate(segs):
   sample=audio[round(seg['start']*rate):round(seg['end']*rate)]
   descriptors=describe(sample,rate)
   resampled=librosa.resample(attack_window(sample,rate),orig_sr=rate,target_sr=16000)
   bank=fbank(crop(resampled,0,len(resampled)/16000)).astype(np.float32).T
   with torch.no_grad():descriptors['metric']=metric(torch.from_numpy(bank[None])).numpy()[0]
   for key,v in descriptors.items():vectors.setdefault(key,[]).append(v)
   rows.append({'file':str(directory/rec['file']),'label':rec['drum'],'split':rec['split'],'fold':min(2,int(i*3/len(segs))),**seg})
 X={k:np.array(v) for k,v in vectors.items()};X['combined']=np.concatenate([X['spectral'],X['mfcc']],axis=1)
 X['all']=np.concatenate([X['combined'],X['metric']],axis=1)
 X['balanced']=np.concatenate([X['spectral'],X['mfcc'],X['metric'],X['envelope']],axis=1)
 blockweights=np.concatenate([np.full(X[k].shape[1],1/np.sqrt(X[k].shape[1])) for k in ['spectral','mfcc','metric','envelope']])
 y=np.array([CLASSES.index(r['label']) for r in rows]);train=np.array([r['split']=='training' for r in rows]);fold=np.array([r['fold'] for r in rows])
 def model(kind,c,feature):
  scale=blockweights if feature=='balanced' else np.ones(X[feature].shape[1])
  estimator=SVC(C=c,class_weight='balanced') if kind=='svm' else KNeighborsClassifier(n_neighbors=c,weights='distance',metric='cosine')
  return make_pipeline(StandardScaler(),FunctionTransformer(lambda v:v*scale),Normalizer(),estimator)

 for label in range(7):
  if sum(train & (y==label))<3:raise ValueError(f'Need at least three supported training segments for {CLASSES[label]}.')
 candidates=[]
 for feature in X:
  for kind,params in [('svm',[.1,1,10,100]),('knn',[1,3,5])]:
   for c in params:
    correct=total=0
    for f in range(3):
     fit=train&(fold!=f);val=train&(fold==f);m=model(kind,c,feature).fit(X[feature][fit],y[fit]);pred=m.predict(X[feature][val]);correct+=sum(pred==y[val]);total+=sum(val)
    candidates.append({'feature':feature,'kind':kind,'parameter':c,'trainingCV':float(correct/total)})
 best=max(candidates,key=lambda c:c['trainingCV']);print('Selected using training only:',best,flush=True)
 m=model(best['kind'],best['parameter'],best['feature']).fit(X[best['feature']][train],y[train]);pred=m.predict(X[best['feature']][~train])
 report={'scope':'Development evaluation on previously inspected take 2; automatic segments, recording-level labels. Not fresh test or verified transcription accuracy.','excluded':excluded,'selected':best,'candidates':candidates,'correct':int(sum(pred==y[~train])),'total':int(sum(~train)),'classes':CLASSES,'confusion':confusion_matrix(y[~train],pred,labels=range(7)).tolist(),'events':[dict(r,prediction=CLASSES[int(v)]) for r,v in zip([r for r in rows if r['split']!='training'],pred)]}
 (a.manifest.parent/('librosa-descriptor-assessment.json' if a.librosa else 'balanced-descriptor-assessment.json')).write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ['candidates','events','excluded']}))
 np.savez_compressed(a.manifest.parent/('librosa-descriptor-profile.npz' if a.librosa else 'balanced-descriptor-profile.npz'),X=X[best['feature']][train],y=y[train])

if __name__=='__main__':main()
