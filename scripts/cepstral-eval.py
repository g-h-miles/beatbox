exec(open('scripts/smooth-eval.py').read().split('model=pickle')[0])
from scipy.fft import dct
from catboost import CatBoostClassifier
import pickle
train=p<=14
cep=np.concatenate([dct(X[:,k:k+20],type=2,norm='ortho',axis=1)[:,1:14] for k in [0,20,40,80]],axis=1)
for kind,Z in [('cep',np.concatenate([cep,X[:,60:80],X[:,100:]],axis=1)),('both',np.concatenate([X,cep],axis=1))]:
 model=CatBoostClassifier(iterations=1000,depth=6,learning_rate=.04,verbose=False,thread_count=4,l2_leaf_reg=5)
 model.fit(Z[train],y[train]);pred=model.predict(Z).flatten();print(kind,accuracy_score(y[val],pred[val]),accuracy_score(y[val&improv],pred[val&improv]),flush=True)
 pickle.dump(model,open('artifacts/model-'+kind+'.pkl','wb'))
