exec(open('scripts/smooth-eval.py').read().split('model=pickle')[0])
from scipy.fft import dct
from catboost import CatBoostClassifier
from sklearn.metrics import confusion_matrix
from pathlib import Path
cep=np.concatenate([dct(X[:,k:k+20],type=2,norm='ortho',axis=1)[:,1:14] for k in [0,20,40,80]],axis=1)
Z=np.concatenate([X,cep],axis=1)
model=CatBoostClassifier(iterations=1000,depth=6,learning_rate=.04,verbose=False,thread_count=4,l2_leaf_reg=5,random_seed=0,allow_writing_files=False)
model.fit(Z[p<=20],y[p<=20]);pred=model.predict(Z).flatten();test=p>=21
report={'trainParticipants':list(range(1,21)),'testParticipants':list(range(21,29)),'classes':model.classes_.tolist(),'all':{'correct':int(sum(pred[test]==y[test])),'total':int(sum(test)),'accuracy':accuracy_score(y[test],pred[test]),'confusion':confusion_matrix(y[test],pred[test]).tolist()},'grooves':{'correct':int(sum(pred[test&improv]==y[test&improv])),'total':int(sum(test&improv)),'accuracy':accuracy_score(y[test&improv],pred[test&improv])},'perParticipant':{str(i):accuracy_score(y[test&improv&(p==i)],pred[test&improv&(p==i)]) for i in range(21,29)}}
print(json.dumps(report,indent=2),flush=True);json.dump(report,open('artifacts/acoustic-report.json','w'),indent=2)
model.save_model('artifacts/catboost.json',format='json');m=json.load(open('artifacts/catboost.json'));mapping={'hhc':'closed','hho':'open','kd':'kick','sd':'snare'}
compact={'classes':[mapping[c] for c in model.classes_],'trees':[{'splits':[[s['float_feature_index'],s['border']] for s in t['splits']],'leaves':[round(v,8) for v in t['leaf_values']]} for t in m['oblivious_trees']]}
Path('src/generated').mkdir(exist_ok=True);json.dump(compact,open('src/generated/acoustic-model.json','w'),separators=(',',':'))
# Parity fixtures cover unseen voices, all classes and uncertain classifications.
json.dump([{'features':rows[i]['features'],'probabilities':model.predict_proba(Z[i:i+1])[0].tolist()} for i in np.where(test)[0][::173]],open('tests/acoustic-fixtures.json','w'),separators=(',',':'))
json.dump([dict(rows[i],prediction=mapping[pred[i]],probabilities=model.predict_proba(Z[i:i+1])[0].tolist()) for i in np.where(test&improv)[0]],open('artifacts/heldout-grooves.json','w'))
