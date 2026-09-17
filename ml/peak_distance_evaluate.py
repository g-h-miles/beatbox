"""Training-selected frozen-network peak separation; validation diagnostic only."""
import hashlib,json
from pathlib import Path
import librosa
import numpy as np
import soundfile as sf
import torch
from scipy.signal import find_peaks
from train_transcriber import Transcriber,RATE,HOP,DT
from native_timing_audit import match

OUT=Path('artifacts/peak-distance');CLASSES=['hhc','hho','kd','sd']

@torch.no_grad()
def probabilities(audio,model):
    mel=librosa.feature.melspectrogram(y=audio,sr=RATE,n_fft=512,hop_length=HOP,n_mels=64,fmin=40)
    x=((librosa.power_to_db(mel,ref=np.max,top_db=80)+40)/20).astype(np.float32)
    padded=np.pad(x,((0,0),(96,96)),constant_values=-2);parts=[]
    for start in range(0,x.shape[1],800):
        stop=min(start+800,x.shape[1]);logits,_=model(torch.from_numpy(padded[:,start:stop+192][None]).to('mps'))
        parts.append(logits.sigmoid()[0,96:-96].cpu().numpy())
    return np.concatenate(parts)

def score(records,distance):
    rows=[]
    for r in records:
        p=np.load(OUT/f"{r['file'][:-4]}-probabilities.npy")
        peaks,_=find_peaks(p,height=.4,distance=distance,prominence=.05);times=peaks*DT
        truth=sorted([a for a in r['annotations'] if a['label'] in CLASSES],key=lambda a:a['time'])
        pairs=match(times,truth,.05);matched={j for _,j in pairs}
        later={i for i in range(1,len(truth)) if truth[i]['time']-truth[i-1]['time']<.1}
        fast=later|{i-1 for i in later}
        rows.append({'file':r['file'],'participant':r['participant'],'mode':r['mode'],'detected':len(times),'reference':len(truth),'matched':len(pairs),
                     'fastReference':len(fast),'fastMatched':len(fast&matched),'fastLaterReference':len(later),'fastLaterMatched':len(later&matched),
                     'missedClasses':{c:sum(a['label']==c and i not in matched for i,a in enumerate(truth)) for c in CLASSES},'times':times.tolist()})
    totals={k:sum(r[k] for r in rows) for k in ['detected','reference','matched','fastReference','fastMatched','fastLaterReference','fastLaterMatched']}
    totals.update(distanceFrames=distance,distanceMs=distance*DT*1000,onsetF1=2*totals['matched']/(totals['detected']+totals['reference']),precision=totals['matched']/totals['detected'],recall=totals['matched']/totals['reference'],
                  extras=totals['detected']-totals['matched'],misses=totals['reference']-totals['matched'],missedClasses={c:sum(r['missedClasses'][c] for r in rows) for c in CLASSES})
    totals['fastRecall']=totals['fastMatched']/totals['fastReference'] if totals['fastReference'] else None
    totals['fastLaterRecall']=totals['fastLaterMatched']/totals['fastLaterReference'] if totals['fastLaterReference'] else None
    return {**totals,'recordings':rows}

def prepare(records,model):
    for i,r in enumerate(records):
        assert 1<=r['participant']<=20 and 'Improvisation' in r['file']
        expected=Path('artifacts/avp-full/AVP_Dataset')/r['mode']/f"Participant_{r['participant']}"/r['file']
        assert Path(r['path']).resolve()==expected.resolve()
        audio,rate=sf.read(expected,dtype='float32',always_2d=True)
        audio=librosa.resample(audio.mean(1),orig_sr=rate,target_sr=RATE)
        np.save(OUT/f"{r['file'][:-4]}-probabilities.npy",probabilities(audio,model))
        print('Prepared',i+1,len(records),r['file'],flush=True)

def main():
    OUT.mkdir(parents=True,exist_ok=True);torch.set_num_threads(4)
    checkpoint_path=Path('artifacts/ml-v2/transcriber.pt');checkpoint=torch.load(checkpoint_path,map_location='cpu',weights_only=True)
    model=Transcriber().to('mps').eval();model.load_state_dict(checkpoint['state'])
    records=[r for r in json.loads(Path('artifacts/events-v2.json').read_text()) if 1<=r['participant']<=20 and 'Improvisation' in r['file']]
    train=[r for r in records if r['participant']<=14];validation=[r for r in records if r['participant']>=15]
    assert len(train)==27 and len(validation)==12
    prepare(train,model)
    trials=[score(train,d) for d in [8,12,16,20]]
    chosen=max(trials,key=lambda r:r['onsetF1'])['distanceFrames']
    frozen={'selectedDistance':chosen,'threshold':.4,'prominence':.05,'modelSha256':hashlib.sha256(checkpoint_path.read_bytes()).hexdigest(),'frameSeconds':DT,'training':trials}
    (OUT/'frozen-selection.json').write_text(json.dumps(frozen,indent=2))
    print('Frozen choice',chosen,flush=True)
    prepare(validation,model)
    validation_scores=[score(validation,d) for d in sorted({8,chosen})]
    report={'protocol':'ml/peak_distance_protocol.md',**frozen,'validation':validation_scores}
    (OUT/'report.json').write_text(json.dumps(report,indent=2))
    for split,scores in [('training',trials),('validation',validation_scores)]:
        for result in scores:print(split,json.dumps({k:v for k,v in result.items() if k!='recordings'}),flush=True)
if __name__=='__main__':main()
