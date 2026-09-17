"""Train-only OOF pooling selector with one fixed feature/model specification."""
import hashlib,json,pickle
from pathlib import Path
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import Pipeline,make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from browser_domain_train import EXT,AVP,references,match,summarize

OUT=Path('artifacts/browser-pool-selector');DOMAIN=Path('artifacts/browser-domain')

def weighted_model(x,y,domains):
    weights=np.zeros(len(y))
    for domain in np.unique(domains):
        for label in np.unique(y[domains==domain]):
            keep=(domains==domain)&(y==label);weights[keep]=1/sum(keep)
    weights*=len(weights)/weights.sum();scaler=StandardScaler();z=scaler.fit_transform(x,sample_weight=weights)
    svm=SVC(C=10,kernel='rbf',gamma='scale',decision_function_shape='ovo');svm.fit(z,y,sample_weight=weights)
    assert list(svm.classes_)==[0,1,2,3]
    return Pipeline([('standardscaler',scaler),('svc',svm)])

def votes(margins):
    result=np.zeros((len(margins),4),dtype=int);column=0
    for i in range(4):
        for j in range(i+1,4):
            result[:,i]+=margins[:,column]>0;result[:,j]+=margins[:,column]<=0;column+=1
    return result

def options(model,x):
    scaler,svm=model.steps[0][1],model.steps[1][1];svm.decision_function_shape='ovo'
    z=scaler.transform(x);raw=svm.decision_function(z);pooled=raw.copy();raw_votes=votes(raw);raw_labels=raw_votes.argmax(1)
    groups=AgglomerativeClustering(n_clusters=min(8,len(z)),linkage='ward').fit_predict(z)
    extras=np.zeros((len(x),3))
    for group in np.unique(groups):
        keep=groups==group;pooled[keep]=raw[keep].mean(0)
        extras[keep,0]=sum(keep)/len(x)
        extras[keep,1]=np.linalg.norm(z[keep]-z[keep].mean(0),axis=1).mean()/np.sqrt(1104)
        for label in range(4):extras[keep&(raw_labels==label),2]=np.mean(raw_labels[keep]==label)
    pooled_votes=votes(pooled);pooled_labels=pooled_votes.argmax(1)
    return raw_labels,pooled_labels,np.concatenate([raw,pooled,raw_votes,pooled_votes,extras],axis=1)

def training_records():
    result=[]
    for row in json.loads(Path('artifacts/browser-relative/training-manifest.json').read_text())['rows']:
        assert 1<=row['participant']<=14
        x=np.fromfile(Path('artifacts/browser-relative')/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104)
        y=np.array([0 if v<2 else v-1 for v in row['labels']])
        result.append({'file':row['file'],'domain':'avp','group':f"avp:{row['participant']}",'x':x,'y':y})
    external=sorted(json.loads(Path('artifacts/external-events-v2.json').read_text()),key=lambda r:r['file'])[:8];allowed={r['file']:r for r in external}
    for row in json.loads((DOMAIN/'training-native-manifest.json').read_text())['rows']:
        assert row['file'] in allowed
        x=np.fromfile(DOMAIN/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104)
        y=match(row['times'],references(allowed[row['file']],row['duration'])['consensus'])
        result.append({'file':row['file'],'domain':'beatboxset','group':f"beatboxset:{row['file']}",'x':x,'y':y})
    return result

def train_selector():
    records=training_records();x=[];y=[];domains=[];groups=[]
    for r in records:
        keep=r['y']>=0;x.extend(r['x'][keep]);y.extend(r['y'][keep]);domains.extend([r['domain']]*sum(keep));groups.extend([r['group']]*sum(keep))
    x,y,domains,groups=np.array(x),np.array(y),np.array(domains),np.array(groups)
    splits=StratifiedGroupKFold(n_splits=4,shuffle=True,random_state=1709)
    selector_x=[];selector_y=[];folds=[]
    for fold,(train,held) in enumerate(splits.split(x,y,groups)):
        train_groups=set(groups[train]);held_groups=set(groups[held]);assert not train_groups&held_groups
        model=weighted_model(x[train],y[train],domains[train]);pickle.dump(model,(OUT/f'fold-{fold}.pkl').open('wb'))
        diagnostics=[]
        for r in records:
            if r['group'] not in held_groups:continue
            raw,pooled,features=options(model,r['x']);known=r['y']>=0;raw_ok=raw==r['y'];pool_ok=pooled==r['y']
            eligible=known&(raw!=pooled)&(raw_ok^pool_ok)
            selector_x.extend(features[eligible]);selector_y.extend(pool_ok[eligible].astype(int))
            diagnostics.append({'file':r['file'],'labeled':int(sum(known)),'rawCorrect':int(sum(raw_ok&known)),'pooledCorrect':int(sum(pool_ok&known)),'eligible':int(sum(eligible)),'poolPreferred':int(sum(pool_ok&eligible))})
        folds.append({'fold':fold,'trainGroups':sorted(train_groups),'heldGroups':sorted(held_groups),'trainEvents':len(train),'heldEvents':len(held),'records':diagnostics})
        print('Fold',fold,'completed; accumulated selector rows',len(selector_y),flush=True)
    sx,sy=np.array(selector_x),np.array(selector_y);assert sx.shape[1]==23 and set(sy)=={0,1}
    selector=make_pipeline(StandardScaler(),LogisticRegression(C=1,class_weight='balanced',max_iter=1000,random_state=1709));selector.fit(sx,sy)
    pickle.dump(selector,(OUT/'selector.pkl').open('wb'))
    frozen={'protocol':'ml/browser_pool_selector_protocol.md','trainingEvents':len(y),'selectorEvents':len(sy),'selectorTargetsRawPool':np.bincount(sy,minlength=2).tolist(),'features':23,'folds':folds,
            'selectorSha256':hashlib.sha256((OUT/'selector.pkl').read_bytes()).hexdigest(),'baseModelSha256':hashlib.sha256((DOMAIN/'browser-domain.pkl').read_bytes()).hexdigest()}
    (OUT/'frozen-selection.json').write_text(json.dumps(frozen,indent=2));return selector,frozen

def validate(selector,frozen):
    model=pickle.load((DOMAIN/'browser-domain.pkl').open('rb'))
    assert hashlib.sha256((DOMAIN/'browser-domain.pkl').read_bytes()).hexdigest()==frozen['baseModelSha256']
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())};evaluation=[]
    for row in json.loads(Path('artifacts/four-relative/native-manifest.json').read_text())['rows']:
        record=records[row['file']];assert 15<=record['participant']<=20
        evaluation.append({'file':row['file'],'domain':'avp','times':row['nativeTimes'],'x':np.fromfile(Path('artifacts/four-relative')/f"{row['stem']}-native.f32",dtype='float32').reshape(-1,1104),
                           'truth':{'reference':[{'time':a['time'],'label':AVP[a['label']]} for a in record['annotations'] if a['label'] in AVP]}})
    external=sorted(json.loads(Path('artifacts/external-events-v2.json').read_text()),key=lambda r:r['file']);allowed={r['file']:r for r in external[8:11]}
    for row in json.loads(Path('artifacts/typesafe-noncore/native-manifest.json').read_text())['rows']:
        assert row['file'] in allowed
        evaluation.append({'file':row['file'],'domain':'beatboxset','times':row['times'],'x':np.fromfile(Path('artifacts/typesafe-noncore')/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104),'truth':references(allowed[row['file']],row['duration'])})
    rows=[];decisions=[]
    for row in evaluation:
        raw,pooled,features=options(model,row['x']);probability=selector.predict_proba(features)[:,1]
        choice=(raw!=pooled)&(probability>=.5);prediction=np.where(choice,pooled,raw)
        decisions.append({'file':row['file'],'disagreements':int(sum(raw!=pooled)),'choosePool':int(sum(choice)),'probabilities':probability.tolist()})
        for annotator,truth in row['truth'].items():
            labels=match(row['times'],truth);keep=labels>=0;actual=labels[keep];guessed=prediction[keep];core=actual<3;other=actual==3
            rows.append({'file':row['file'],'domain':row['domain'],'annotator':annotator,'pipeline':'selector','detected':len(prediction),'reference':len(truth),'matched':len(actual),
                         'matchedCore':int(sum(core)),'correctCore':int(sum((actual==guessed)&core)),'matchedOther':int(sum(other)),'otherRetained':int(sum((guessed==3)&other)),
                         'confusion':confusion_matrix(actual,guessed,labels=[0,1,2,3]).tolist(),'predictions':prediction.tolist()})
    summaries=[]
    for domain,annotators in [('avp',['reference']),('beatboxset',['DR','HT','consensus'])]:
        for annotator in annotators:
            summary={'domain':domain,'annotator':annotator,'pipeline':'selector',**summarize([r for r in rows if r['domain']==domain and r['annotator']==annotator])}
            summaries.append(summary);print(json.dumps(summary),flush=True)
    previous=json.loads((DOMAIN/'report.json').read_text())['summaries']
    report={'frozen':frozen,'summaries':summaries,'previous':previous,'decisions':decisions,'recordings':rows}
    (OUT/'report.json').write_text(json.dumps(report,indent=2))

def main():
    OUT.mkdir(parents=True,exist_ok=True);selector,frozen=train_selector();validate(selector,frozen)
if __name__=='__main__':main()
