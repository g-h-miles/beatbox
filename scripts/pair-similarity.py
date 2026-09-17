"""Learn same-sound distance on training performers; evaluate representative review."""
exec(open('scripts/smooth-eval.py').read().split('model=pickle')[0])
from catboost import CatBoostClassifier
from sklearn.cluster import AgglomerativeClustering
from scipy.spatial.distance import squareform
import json
rng=np.random.default_rng(42)
Z=np.c_[S,X[:,:60],np.log(D)]
def pair(a,b):return np.c_[np.abs(Z[a]-Z[b]),(Z[a]+Z[b])/2]
a=[];b=[]
for person in range(1,15):
 for mode in ['Fixed','Personal']:
  idx=np.array([i for i,r in enumerate(rows) if p[i]==person and r['mode']==mode])
  if len(idx):a.extend(rng.choice(idx,2000));b.extend(rng.choice(idx,2000))
a=np.array(a);b=np.array(b)
model=CatBoostClassifier(iterations=600,depth=6,learning_rate=.05,thread_count=4,verbose=False,allow_writing_files=False)
model.fit(pair(a,b),y[a]==y[b]);print('trained',flush=True)
report=[]
for cohort,mask in [('validation',val&improv),('developmentTest',(p>=21)&improv)]:
 distances={}
 for f in sorted(set(files[mask])):
  idx=np.where(files==f)[0];i,j=np.triu_indices(len(idx),1);d=squareform(1-model.predict_proba(pair(idx[i],idx[j]))[:,1]);distances[f]=(idx,d)
 for linkage in ['average','complete']:
  for k in [4,6,8,10,12]:
   correct=total=reviewed=0
   for f,(idx,d) in distances.items():
    groups=AgglomerativeClustering(n_clusters=min(k,len(idx)),metric='precomputed',linkage=linkage).fit_predict(d);prediction=np.empty(len(idx),dtype=object);selected=[]
    for group in np.unique(groups):
     members=np.where(groups==group)[0];rep=members[d[np.ix_(members,members)].sum(1).argmin()];selected.append(rep);prediction[members]=y[idx[rep]]
    unseen=np.ones(len(idx),dtype=bool);unseen[selected]=False;correct+=int(sum(prediction[unseen]==y[idx[unseen]]));total+=int(unseen.sum());reviewed+=len(selected)
   item={'cohort':cohort,'linkage':linkage,'groups':k,'correctUnreviewed':correct,'totalUnreviewed':total,'accuracyUnreviewed':correct/total,'reviewed':reviewed};report.append(item);print(item,flush=True)
json.dump(report,open('artifacts/pair-similarity-report.json','w'),indent=2)
