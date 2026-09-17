exec(open('scripts/smooth-eval.py').read().split('model=pickle')[0])
from scipy.fft import dct
from sklearn.neighbors import KNeighborsClassifier
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
cep=np.concatenate([dct(X[:,k:k+20],type=2,norm='ortho',axis=1)[:,1:14] for k in [0,20,40,80]],axis=1)
for count in [3,5,10]:
 for feature,Z in [('spectrum',X[:,80:100]),('cep',cep),('all',X),('combined',np.concatenate([X,cep],axis=1))]:
  truth=[];pred=[]
  for person in range(21,29):
   for mode in ['Fixed','Personal']:
    match=(p==person)&np.array([r['mode']==mode for r in rows]);train=[]
    for label in ['hhc','hho','kd','sd']:
     train.extend(np.where(match&~improv&(y==label))[0][:count])
    test=np.where(match&improv)[0]
    if len(train)<count*4:continue
    # Normalize against training population, not target examples/test data.
    scale=Z[p<=20].std(axis=0);scale=np.maximum(scale,.01)
    model=KNeighborsClassifier(n_neighbors=3,weights='distance').fit(Z[train]/scale,y[train])
    truth.extend(y[test]);pred.extend(model.predict(Z[test]/scale))
  print(count,feature,accuracy_score(truth,pred),len(truth),flush=True)
