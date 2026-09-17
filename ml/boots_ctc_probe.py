"""Unconstrained CTC speech probe; no beatbox labels or forced transcript.

Public development loop plus explicitly synthetic spoken controls. This does
not provide a human-ground-truth recognition benchmark or alter the app.
"""
import json
from pathlib import Path
import numpy as np
import librosa
import torch
from huggingface_hub import hf_hub_download
from transformers import Wav2Vec2ForCTC
OUT=Path('artifacts/boots-research/ctc');OUT.mkdir(parents=True,exist_ok=True)
MODEL='facebook/wav2vec2-base-960h';REV='22aad52d435eb6dbaf354bdad9b0da84ce7d6156'

def main():
 torch.set_num_threads(4);vocab=json.loads(Path(hf_hub_download(MODEL,'vocab.json',revision=REV)).read_text());inverse={i:s for s,i in vocab.items()};model=Wav2Vec2ForCTC.from_pretrained(MODEL,revision=REV,local_files_only=True).eval();rows=[]
 for path,kind in [('artifacts/new-public-audio/freesound-740030.mp3','unannotated public human development clip'),('artifacts/boots-and-cats-continuous.wav','synthetic speech control'),('artifacts/boots-and-cats.wav','synthetic speech control')]:
  audio,_=librosa.load(path,sr=16000);normalized=(audio-audio.mean())/np.sqrt(audio.var()+1e-7)
  with torch.no_grad():logits=model(torch.tensor(normalized)[None]).logits[0];prob=logits.softmax(-1);ids=prob.argmax(-1).numpy()
  spans=[];last=None
  for frame,token in enumerate(ids):
   token=int(token)
   if token!=last:
    if token!=model.config.pad_token_id:spans.append({'token':inverse[token],'start':frame*model.config.inputs_to_logits_ratio/16000,'end':(frame+1)*model.config.inputs_to_logits_ratio/16000,'meanPosterior':float(prob[frame,token]),'frames':1})
   elif token!=model.config.pad_token_id:
    item=spans[-1];item['end']=(frame+1)*model.config.inputs_to_logits_ratio/16000;item['meanPosterior']+=float(prob[frame,token]);item['frames']+=1
   last=token
  for item in spans:item['meanPosterior']/=item['frames']
  text=''.join(s['token'] for s in spans).replace('|',' ').strip();row={'path':path,'kind':kind,'seconds':len(audio)/16000,'unconstrainedTranscript':text,'spans':spans,'meanBlankPosterior':float(prob[:,model.config.pad_token_id].mean())};rows.append(row);np.savez_compressed(OUT/(Path(path).stem+'-logits.npz'),logits=logits.numpy());print(path,text,flush=True)
 (OUT/'report.json').write_text(json.dumps({'model':MODEL,'revision':REV,'scope':__doc__,'rows':rows},indent=2))
if __name__=='__main__':main()
