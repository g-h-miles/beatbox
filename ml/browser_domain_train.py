"""Fixed weighted AVP+Beatboxset browser-feature SVM; no validation selection."""
import hashlib,json,pickle
from pathlib import Path
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import confusion_matrix
from browser_relative_train import vote

OUT=Path('artifacts/browser-domain')
EXT={'hc':0,'ho':0,'k':1,'s':2,'sb':2,'sk':2,'br':3,'m':3,'v':3,'x':3}
AVP={'hhc':0,'hho':0,'kd':1,'sd':2}

def references(record,duration):
    mapped={who:[{'time':a['time'],'label':EXT[a['label']]} for a in record['annotations'][who] if a['label'] in EXT and 0<=a['time']<duration] for who in ['DR','HT']}
    pairs=sorted((abs(a['time']-b['time']),i,j) for i,a in enumerate(mapped['DR']) for j,b in enumerate(mapped['HT']) if abs(a['time']-b['time'])<.05)
    used_a,used_b=set(),set();consensus=[]
    for _,i,j in pairs:
        if i in used_a or j in used_b:continue
        used_a.add(i);used_b.add(j)
        if mapped['DR'][i]['label']==mapped['HT'][j]['label']:consensus.append(mapped['DR'][i])
    return {**mapped,'consensus':consensus}

def match(times,truth):
    pairs=sorted((abs(t-a['time']),i,j) for i,t in enumerate(times) for j,a in enumerate(truth) if abs(t-a['time'])<.05)
    labels=np.full(len(times),-100,dtype='int64');used=set()
    for _,i,j in pairs:
        if labels[i]!=-100 or j in used:continue
        labels[i]=truth[j]['label'];used.add(j)
    return labels

def predict(model,x,grouped):
    scaler,svm=model.steps[0][1],model.steps[1][1];svm.decision_function_shape='ovo'
    z=scaler.transform(x);margin=svm.decision_function(z)
    if grouped:
        groups=AgglomerativeClustering(n_clusters=min(8,len(z)),linkage='ward').fit_predict(z)
        for group in np.unique(groups):
            keep=groups==group;margin[keep]=margin[keep].mean(0)
    return vote(margin,len(svm.classes_))

def summarize(rows):
    sums={key:sum(r[key] for r in rows) for key in ['detected','reference','matched','matchedCore','correctCore','matchedOther','otherRetained']}
    sums.update(missing=sums['reference']-sums['matched'],unmatchedDetections=sums['detected']-sums['matched'],
                onsetF1=2*sums['matched']/(sums['detected']+sums['reference']),
                jointMappedF1=2*(sums['correctCore']+sums['otherRetained'])/(sums['detected']+sums['reference']),
                matchedCoreAccuracy=sums['correctCore']/sums['matchedCore'] if sums['matchedCore'] else None,
                otherRecall=sums['otherRetained']/sums['matchedOther'] if sums['matchedOther'] else None,
                confusion=np.sum([r['confusion'] for r in rows],axis=0).tolist())
    return sums

def main():
    external=sorted(json.loads(Path('artifacts/external-events-v2.json').read_text()),key=lambda r:r['file'])
    allowed_train={r['file'] for r in external[:8]};allowed_val={r['file'] for r in external[8:11]};lookup={r['file']:r for r in external}
    training=[];labels=[];domains=[];train_rows=[]
    for row in json.loads(Path('artifacts/browser-relative/training-manifest.json').read_text())['rows']:
        assert 1<=row['participant']<=14
        x=np.fromfile(Path('artifacts/browser-relative')/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104)
        y=np.array([0 if v<2 else v-1 for v in row['labels']])
        training.extend(x);labels.extend(y);domains.extend(['avp']*len(y));train_rows.append({'file':row['file'],'detected':len(x),'labeled':len(y),'domain':'avp'})
    for row in json.loads((OUT/'training-native-manifest.json').read_text())['rows']:
        assert row['file'] in allowed_train
        x=np.fromfile(OUT/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104)
        truth=references(lookup[row['file']],row['duration'])['consensus'];y=match(row['times'],truth);keep=y>=0
        training.extend(x[keep]);labels.extend(y[keep]);domains.extend(['beatboxset']*sum(keep));train_rows.append({'file':row['file'],'detected':len(x),'labeled':int(sum(keep)),'consensus':len(truth),'domain':'beatboxset'})
    x=np.array(training);y=np.array(labels);domains=np.array(domains);weights=np.zeros(len(y));counts={}
    for domain in ['avp','beatboxset']:
        for label in range(4):
            keep=(domains==domain)&(y==label);count=int(sum(keep))
            if count:weights[keep]=1/count;counts[f'{domain}:{label}']=count
    weights*=len(weights)/weights.sum()
    scaler=StandardScaler();z=scaler.fit_transform(x,sample_weight=weights)
    svm=SVC(C=10,kernel='rbf',gamma='scale',decision_function_shape='ovo');svm.fit(z,y,sample_weight=weights)
    model=Pipeline([('standardscaler',scaler),('svc',svm)])
    model_path=OUT/'browser-domain.pkl';pickle.dump(model,model_path.open('wb'))
    frozen={'protocol':'ml/browser_domain_protocol.md','C':10,'counts':counts,'training':train_rows,'modelSha256':hashlib.sha256(model_path.read_bytes()).hexdigest()}
    (OUT/'frozen-training.json').write_text(json.dumps(frozen,indent=2))
    print('Frozen training',counts,flush=True)
    baseline=pickle.load(Path('artifacts/browser-relative/browser-relative-3.pkl').open('rb'))
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())};evaluation=[]
    for row in json.loads(Path('artifacts/four-relative/native-manifest.json').read_text())['rows']:
        record=records[row['file']];assert 15<=record['participant']<=20
        evaluation.append({'file':row['file'],'domain':'avp','times':row['nativeTimes'],
                           'x':np.fromfile(Path('artifacts/four-relative')/f"{row['stem']}-native.f32",dtype='float32').reshape(-1,1104),
                           'truth':{'reference':[{'time':a['time'],'label':AVP[a['label']]} for a in record['annotations'] if a['label'] in AVP]}})
    for row in json.loads(Path('artifacts/typesafe-noncore/native-manifest.json').read_text())['rows']:
        assert row['file'] in allowed_val
        evaluation.append({'file':row['file'],'domain':'beatboxset','times':row['times'],
                           'x':np.fromfile(Path('artifacts/typesafe-noncore')/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104),
                           'truth':references(lookup[row['file']],row['duration'])})
    results=[]
    for row in evaluation:
        predictions={f'{name}_{kind}':predict(m,row['x'],kind=='pooled') for name,m in [('baseline',baseline),('candidate',model)] for kind in ['raw','pooled']}
        for annotator,truth in row['truth'].items():
            labels=match(row['times'],truth);keep=labels>=0;actual=labels[keep];core=actual<3;other=actual==3
            for pipeline,prediction in predictions.items():
                guessed=prediction[keep]
                results.append({'file':row['file'],'domain':row['domain'],'annotator':annotator,'pipeline':pipeline,'detected':len(prediction),'reference':len(truth),'matched':len(actual),
                                'matchedCore':int(sum(core)),'correctCore':int(sum((actual==guessed)&core)),'matchedOther':int(sum(other)),'otherRetained':int(sum((guessed==3)&other)),
                                'confusion':confusion_matrix(actual,guessed,labels=[0,1,2,3]).tolist(),'predictions':prediction.tolist()})
    summaries=[]
    for domain,annotators in [('avp',['reference']),('beatboxset',['DR','HT','consensus'])]:
        for annotator in annotators:
            for pipeline in ['baseline_raw','baseline_pooled','candidate_raw','candidate_pooled']:
                selected=[r for r in results if r['domain']==domain and r['annotator']==annotator and r['pipeline']==pipeline]
                summary={'domain':domain,'annotator':annotator,'pipeline':pipeline,**summarize(selected)};summaries.append(summary);print(json.dumps(summary),flush=True)
    assert next(s['correctCore'] for s in summaries if s['domain']=='avp' and s['pipeline']=='baseline_pooled')==639
    (OUT/'report.json').write_text(json.dumps({'frozen':frozen,'classes':['hat','kick','snare','other'],'summaries':summaries,'recordings':results,'limitations':'Repeated development cohorts; consensus partial reference means unmatched detections are not established false positives. Other is not explicit ride/crash. Pure acoustic model; no TypeSafe/gate.'},indent=2))
if __name__=='__main__':main()
