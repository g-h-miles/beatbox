"""One frozen count-scaled Ward rule, saved model and validation caches only."""
import hashlib,json,math,pickle
from pathlib import Path
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import confusion_matrix
from browser_domain_train import OUT,AVP,references,match,summarize
from browser_relative_train import vote

def main():
    previous=json.loads((OUT/'report.json').read_text())
    model_path=OUT/'browser-domain.pkl';assert hashlib.sha256(model_path.read_bytes()).hexdigest()==previous['frozen']['modelSha256']
    model=pickle.load(model_path.open('rb'));scaler,svm=model.steps[0][1],model.steps[1][1];svm.decision_function_shape='ovo'
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())}
    external=sorted(json.loads(Path('artifacts/external-events-v2.json').read_text()),key=lambda r:r['file']);allowed={r['file']:r for r in external[8:11]};evaluation=[]
    for row in json.loads(Path('artifacts/four-relative/native-manifest.json').read_text())['rows']:
        record=records[row['file']];assert 15<=record['participant']<=20
        evaluation.append({'file':row['file'],'domain':'avp','times':row['nativeTimes'],'x':np.fromfile(Path('artifacts/four-relative')/f"{row['stem']}-native.f32",dtype='float32').reshape(-1,1104),
                           'truth':{'reference':[{'time':a['time'],'label':AVP[a['label']]} for a in record['annotations'] if a['label'] in AVP]}})
    for row in json.loads(Path('artifacts/typesafe-noncore/native-manifest.json').read_text())['rows']:
        assert row['file'] in allowed
        evaluation.append({'file':row['file'],'domain':'beatboxset','times':row['times'],'x':np.fromfile(Path('artifacts/typesafe-noncore')/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104),'truth':references(allowed[row['file']],row['duration'])})
    results=[];groups_info=[]
    for row in evaluation:
        x=row['x'];z=scaler.transform(x);count=min(len(z),max(8,math.ceil(len(z)/8)));groups=AgglomerativeClustering(n_clusters=count,linkage='ward').fit_predict(z);margins=svm.decision_function(z)
        for group in np.unique(groups):
            keep=groups==group;margins[keep]=margins[keep].mean(0)
        prediction=vote(margins,4);groups_info.append({'file':row['file'],'events':len(z),'groups':count,'maxGroupSize':int(np.bincount(groups).max())})
        for annotator,truth in row['truth'].items():
            labels=match(row['times'],truth);keep=labels>=0;actual=labels[keep];guessed=prediction[keep];core=actual<3;other=actual==3
            results.append({'file':row['file'],'domain':row['domain'],'annotator':annotator,'pipeline':'candidate_scaled_groups','detected':len(prediction),'reference':len(truth),'matched':len(actual),
                            'matchedCore':int(sum(core)),'correctCore':int(sum((actual==guessed)&core)),'matchedOther':int(sum(other)),'otherRetained':int(sum((guessed==3)&other)),
                            'confusion':confusion_matrix(actual,guessed,labels=[0,1,2,3]).tolist(),'predictions':prediction.tolist()})
    summaries=[]
    for domain,annotators in [('avp',['reference']),('beatboxset',['DR','HT','consensus'])]:
        for annotator in annotators:
            selected=[r for r in results if r['domain']==domain and r['annotator']==annotator]
            summary={'domain':domain,'annotator':annotator,'pipeline':'candidate_scaled_groups',**summarize(selected)};summaries.append(summary);print(json.dumps(summary),flush=True)
    report={'protocol':'ml/browser_domain_groups_protocol.md','modelSha256':previous['frozen']['modelSha256'],'groups':groups_info,'previous':[r for r in previous['summaries'] if r['pipeline'] in ['candidate_raw','candidate_pooled']],
            'summaries':summaries,'recordings':results}
    (OUT/'groups-report.json').write_text(json.dumps(report,indent=2))
if __name__=='__main__':main()
