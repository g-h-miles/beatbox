"""Post-training validation-only voice-balanced prototype classifier.

Use the already selected contrastive encoder. One prototype per training voice
and class prevents long recordings dominating neighbor counts. Reserved tests
remain untouched. This is another validation selection, not independent proof.
"""
import json
from pathlib import Path
import numpy as np
import torch
from core_mdv_contrastive import Encoder
from core_mdv_classical import metrics
OUT=Path('artifacts/core-model/mdv')

def main():
 torch.set_num_threads(4);device='mps' if torch.backends.mps.is_available() else 'cpu';rows=json.loads((OUT/'events.json').read_text());val=np.array([i for i,r in enumerate(rows) if r['split']=='validation']);x=np.load(OUT/'banks.npy').astype('float32');x-=x.mean((1,2),keepdims=True);x/=2;reference=np.load(OUT/'contrastive-reference.npz');z=reference['embeddings'];labels=reference['labels'];voices=reference['voices'];centroids=[];targets=[]
 for voice in sorted(set(voices)):
  for c in range(4):
   keep=(voices==voice)&(labels==c)
   if not keep.any():continue
   center=z[keep].mean(0);centroids.append(center/max(np.linalg.norm(center),1e-8));targets.append(c)
 centers=np.stack(centroids);targets=np.array(targets);model=Encoder().to(device);saved=torch.load(OUT/'contrastive.pt',map_location=device,weights_only=True);model.load_state_dict(saved['state']);model.eval();parts=[]
 with torch.no_grad():
  for offset in range(0,len(val),128):parts.append(model(torch.tensor(x[val[offset:offset+128]],device=device))[0].cpu().numpy())
 query=np.concatenate(parts);sim=query@centers.T;truth=np.array([rows[i]['label'] for i in val]);trials=[]
 for k in [1,3,5]:
  scores=np.stack([np.sort(sim[:,targets==c],axis=1)[:,-k:].mean(1) for c in range(4)],axis=1);result=metrics([rows[i] for i in val],truth,scores.argmax(1));trials.append({'nearestVoicesPerClass':k,**result})
 selected=max(trials,key=lambda r:r['domainMeanMacroRecall']);report={'encoderEpoch':saved['epoch'],'selection':'Additional validation-only classifier selection; not an independent holdout.','trials':trials,'selectedValidation':selected};(OUT/'voice-prototype-report.json').write_text(json.dumps(report,indent=2));np.savez_compressed(OUT/'voice-prototypes.npz',embeddings=centers,labels=targets,neighbors=selected['nearestVoicesPerClass']);print(json.dumps(report,indent=2))
if __name__=='__main__':main()
