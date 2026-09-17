exec(open('scripts/smooth-eval.py').read().split('model=pickle')[0])
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import confusion_matrix
for count in [1,2,3]:
 for durationWeight in [0,.5,1,2]:
  truth=[];pred=[];byPerson={}
  for file in set(files[(p>=21)&improv]):
   idx=np.where(files==file)[0];train=[]
   for label in ['kd','sd','hhc','hho']:train.extend([i for i in idx if y[i]==label][:count])
   test=[i for i in idx if i not in train]
   if not test:continue
   Z=np.concatenate([S,np.log(D[:,None])*durationWeight],axis=1)
   model=KNeighborsClassifier(n_neighbors=1).fit(Z[train],y[train]);q=model.predict(Z[test]);truth.extend(y[test]);pred.extend(q)
   byPerson[file]=accuracy_score(y[test],q)
  print(count,durationWeight,accuracy_score(truth,pred),len(truth),flush=True)
