"""Test a rhythm-order prior without moving any detected onset."""
exec(open('scripts/smooth-eval.py').read().split('model=pickle')[0])
from scipy.fft import dct
from catboost import CatBoostClassifier
from scipy.special import logsumexp
cep=np.concatenate([dct(X[:,k:k+20],type=2,norm='ortho',axis=1)[:,1:14] for k in [0,20,40,80]],axis=1);Z=np.c_[X,cep]
model=pickle.load(open('artifacts/model-both.pkl','rb'));classes=list(model.classes_);prob=model.predict_proba(Z);target=np.array([classes.index(v) for v in y]);trans=np.ones((4,4));prior=np.bincount(target[p<=14],minlength=4);prior=prior/prior.sum()
for f in set(files[(p<=14)&improv]):
 idx=np.where(files==f)[0]
 for a,b in zip(idx[:-1],idx[1:]):trans[target[a],target[b]]+=1
trans=np.log(trans/trans.sum(1,keepdims=True))
def decode(mask,weight,priorWeight):
 truth=[];pred=[]
 for f in sorted(set(files[mask])):
  idx=np.where(files==f)[0];emission=np.log(prob[idx]+1e-9)-priorWeight*np.log(prior);dp=emission[0];back=[]
  for at in range(1,len(idx)):
   costs=dp[:,None]+weight*trans;back.append(costs.argmax(0));dp=costs.max(0)+emission[at]
  path=[int(dp.argmax())]
  for b in reversed(back):path.append(int(b[path[-1]]))
  pred.extend(reversed(path));truth.extend(target[idx])
 return {'correct':int(sum(np.array(truth)==pred)),'total':len(truth),'accuracy':accuracy_score(truth,pred)}
trials=[]
for w in [0,.25,.5,1,2,3]:
 for pw in [0,.5,1]:
  score=decode(val&improv,w,pw);trials.append((score['accuracy'],w,pw))
best=max(trials);report={'validationAccuracy':best[0],'transitionWeight':best[1],'priorWeight':best[2],'developmentTest':decode((p>=21)&improv,best[1],best[2]),'baseline':decode((p>=21)&improv,0,0)};print(json.dumps(report,indent=2));json.dump(report,open('artifacts/sequence-report.json','w'),indent=2)
