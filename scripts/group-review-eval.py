"""Measure assisted labeling separately: only representative labels are revealed."""
exec(open('scripts/smooth-eval.py').read().split('model=pickle')[0])
from sklearn.cluster import AgglomerativeClustering
from scipy.spatial.distance import cdist
from scipy.fft import dct
import json
spec=np.load('artifacts/spectrograms.npy')[:,0]
# Compare spectral summaries and duration without using labels to form groups.
variants={'spectrum':np.c_[S,np.log(D)*2], 'temporal':np.c_[X[:,:60],np.log(D)*2], 'mel':np.c_[spec.mean(2),spec.std(2),np.log(D)*2]}
report=[]
for name,Z in variants.items():
 for k in [4,6,8,10,12,16]:
  correct=total=reviewed=0;details=[]
  for f in sorted(set(files[(p>=21)&improv])):
   idx=np.where(files==f)[0];z=Z[idx];groups=AgglomerativeClustering(n_clusters=min(k,len(idx))).fit_predict(z);prediction=np.empty(len(idx),dtype=object);selected=[]
   for group in np.unique(groups):
    members=np.where(groups==group)[0];dist=cdist(z[members],z[members]);rep=members[dist.sum(1).argmin()];selected.append(rep);prediction[members]=y[idx[rep]]
   unseen=np.ones(len(idx),dtype=bool);unseen[selected]=False
   n=int(unseen.sum());c=int(sum(prediction[unseen]==y[idx[unseen]]));correct+=c;total+=n;reviewed+=len(selected);details.append({'file':str(f),'correct':c,'total':n,'reviewed':len(selected)})
  item={'features':name,'groups':k,'correctUnreviewed':correct,'totalUnreviewed':total,'accuracyUnreviewed':correct/total,'reviewed':reviewed,'details':details};report.append(item);print(name,k,round(correct/total,4),'reviewed',reviewed,flush=True)
json.dump(report,open('artifacts/group-review-report.json','w'),indent=2)
