import json, numpy as np
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from catboost import CatBoostClassifier
from sklearn.metrics import accuracy_score, confusion_matrix
rows=[r for r in json.load(open('artifacts/dataset.json')) if r['label'] in ['kd','sd','hhc','hho']]
keys=['duration','centroid','low','mid','high','flatness','zcr','attack']
X=np.array([r['features']['acoustic']+r['features']['spectrum']+[r['features'][k] for k in keys] for r in rows]); y=np.array([r['label'] for r in rows]); p=np.array([int(r['participant'].split('_')[1]) for r in rows])
# Never split individual hits randomly: voices and recording conditions must stay together.
train=p<=14; val=(p>=15)&(p<=20); test=p>=21
for name,model in [('extra',ExtraTreesClassifier(n_estimators=200,min_samples_leaf=2,max_features=.8,n_jobs=-1,random_state=42)),('forest',RandomForestClassifier(n_estimators=200,min_samples_leaf=2,max_features=.8,n_jobs=-1,random_state=42)),('svc',make_pipeline(StandardScaler(),SVC(C=10,gamma='scale',probability=True))),('cat',CatBoostClassifier(iterations=700,depth=6,learning_rate=.05,verbose=False,thread_count=4)),('boost',HistGradientBoostingClassifier(max_iter=200,max_leaf_nodes=15,l2_regularization=2,random_state=42))]:
 model.fit(X[train],y[train]);pred=model.predict(X[val]);print(name,'validation',accuracy_score(y[val],pred),confusion_matrix(y[val],pred),flush=True)

 import pickle
 pickle.dump(model,open('artifacts/model-'+name+'.pkl','wb'))
 print('improvisations',accuracy_score(y[val & np.array(['Improvisation' in r['file'] for r in rows])],model.predict(X[val & np.array(['Improvisation' in r['file'] for r in rows])])),flush=True)
