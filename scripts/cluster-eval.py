exec(open('scripts/smooth-eval.py').read().split('model=pickle')[0])
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from scipy.fft import dct
model=pickle.load(open('artifacts/model-both.pkl','rb'));cep=np.concatenate([dct(X[:,k:k+20],type=2,norm='ortho',axis=1)[:,1:14] for k in [0,20,40,80]],axis=1);prob=model.predict_proba(np.concatenate([X,cep],axis=1));labels=model.classes_
for n in [3,4,'auto']:
 for weight in [.3,1,3]:
  pred=labels[prob.argmax(1)].copy()
  for file in set(files[val&improv]):
   idx=np.where(files==file)[0];s=S[idx];z=np.concatenate([s,np.log(D[idx,None])*weight],axis=1)
   options=[]
   for k in ([2,3,4] if n=='auto' else [n]):
    c=KMeans(n_clusters=k,n_init=10,random_state=42).fit_predict(z);q=np.stack([np.mean(prob[idx][c==j],axis=0) for j in range(k)]);a,b=linear_sum_assignment(-np.log(q+1e-6));assign=dict(zip(a,b));lab=np.array([assign[j] for j in c]);options.append((silhouette_score(z,c),lab))
   pred[idx]=labels[max(options,key=lambda v:v[0])[1]]
  print(n,weight,accuracy_score(y[val&improv],pred[val&improv]),flush=True)
