"""One fixed cross-speaker linear metric on production browser training features."""
import hashlib,json,pickle
from pathlib import Path
import numpy as np
import torch
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC
from sklearn.metrics import pairwise_distances,confusion_matrix
from sklearn.cluster import AgglomerativeClustering
from browser_relative_train import vote
from four_relative_train import CORE,match_labels

OUT=Path('artifacts/browser-metric');SOURCE=Path('artifacts/browser-relative')

def predict(pipeline,features,grouped):
    scaler,svm=pipeline.steps[0][1],pipeline.steps[1][1];svm.decision_function_shape='ovo'
    z=scaler.transform(features);margin=svm.decision_function(z)
    if grouped:
        groups=AgglomerativeClustering(n_clusters=min(8,len(z)),linkage='ward').fit_predict(z)
        for group in np.unique(groups):
            keep=groups==group;margin[keep]=margin[keep].mean(0)
    return vote(margin,3)

def main():
    OUT.mkdir(parents=True,exist_ok=True);np.random.seed(1709);torch.manual_seed(1709);torch.set_num_threads(4)
    x=[];y=[];participants=[]
    for row in json.loads((SOURCE/'training-manifest.json').read_text())['rows']:
        assert 1<=row['participant']<=14
        features=np.fromfile(SOURCE/f"{row['stem']}-features.f32",dtype='float32').reshape(-1,1104)
        x.extend(features);y.extend(CORE[row['labels']]);participants.extend([row['participant']]*len(features))
    x,y,participants=np.array(x),np.array(y),np.array(participants);assert len(y)==1161
    input_scaler=StandardScaler();z=input_scaler.fit_transform(x)
    pca=PCA(n_components=32,svd_solver='full');pca.fit(z)
    initial=(pca.components_/np.sqrt(pca.explained_variance_[:,None]+1e-6)).astype('float32')
    distances=pairwise_distances(z,metric='euclidean');distances[y[:,None]==y[None,:]]=np.inf
    negatives=distances.argmin(1);positives=[np.flatnonzero((y==y[i])&(participants!=participants[i])) for i in range(len(y))]
    assert all(len(p)>0 for p in positives)
    weights=np.zeros(len(y),dtype='float32')
    for participant in np.unique(participants):
        for label in np.unique(y[participants==participant]):
            keep=(participants==participant)&(y==label);weights[keep]=1/sum(keep)
    weights*=len(weights)/weights.sum()
    tensor=torch.from_numpy(z);start=torch.from_numpy(initial);projection=torch.nn.Parameter(start.clone())
    optimizer=torch.optim.Adam([projection],lr=.001);weight_tensor=torch.from_numpy(weights);negative=torch.from_numpy(negatives)
    generator=np.random.default_rng(1709);history=[]
    for epoch in range(100):
        positive=torch.from_numpy(np.array([generator.choice(p) for p in positives]))
        transformed=tensor@projection.T
        dpositive=(transformed-transformed[positive]).square().mean(1);dnegative=(transformed-transformed[negative]).square().mean(1)
        triplet=(torch.relu(dpositive-dnegative+1)*weight_tensor).mean();regular=.01*(projection-start).square().mean();loss=triplet+regular
        assert torch.isfinite(loss)
        optimizer.zero_grad();loss.backward();optimizer.step();history.append({'epoch':epoch+1,'loss':float(loss.detach()),'triplet':float(triplet.detach()),'regularization':float(regular.detach())})
        if (epoch+1)%20==0:print('Epoch',epoch+1,'loss',history[-1]['loss'],flush=True)
    matrix=projection.detach().numpy();projected=z@matrix.T
    output_scaler=StandardScaler();scaled=output_scaler.fit_transform(projected)
    svm=SVC(C=10,kernel='rbf',gamma='scale',decision_function_shape='ovo');svm.fit(scaled,y)
    model=Pipeline([('standardscaler',output_scaler),('svc',svm)])
    bundle={'inputScaler':input_scaler,'projection':matrix,'classifier':model}
    path=OUT/'metric.pkl';pickle.dump(bundle,path.open('wb'))
    frozen={'protocol':'ml/browser_metric_protocol.md','seed':1709,'trainingEvents':len(y),'rank':32,'epochs':100,'modelSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'history':history}
    (OUT/'frozen-training.json').write_text(json.dumps(frozen,indent=2));print('Projection/model frozen',flush=True)
    baseline=pickle.load((SOURCE/'browser-relative-3.pkl').open('rb'))
    records={r['file']:r for r in json.loads(Path('artifacts/events-v2.json').read_text())};rows=[]
    for row in json.loads(Path('artifacts/four-relative/native-manifest.json').read_text())['rows']:
        record=records[row['file']];assert 15<=record['participant']<=20
        original=np.fromfile(Path('artifacts/four-relative')/f"{row['stem']}-native.f32",dtype='float32').reshape(-1,1104)
        transformed=input_scaler.transform(original)@matrix.T
        labels,count=match_labels(record,row['nativeTimes']);keep=labels>=0;actual=CORE[labels[keep]]
        for name,pipeline,features in [('baseline',baseline,original),('metric',model,transformed)]:
            for kind in ['raw','pooled']:
                predictions=predict(pipeline,features,kind=='pooled');guessed=predictions[keep]
                rows.append({'file':row['file'],'mode':record['mode'],'pipeline':f'{name}_{kind}','detected':len(predictions),'reference':count,'matched':len(actual),'correctCore':int(sum(actual==guessed)),
                             'confusion':confusion_matrix(actual,guessed,labels=[0,1,2]).tolist(),'predictions':predictions.tolist()})
    summaries=[]
    for mode in ['all','Fixed','Personal']:
        for pipeline in ['baseline_raw','baseline_pooled','metric_raw','metric_pooled']:
            group=[r for r in rows if r['pipeline']==pipeline and (mode=='all' or r['mode']==mode)]
            total={k:sum(r[k] for r in group) for k in ['detected','reference','matched','correctCore']};total.update(mode=mode,pipeline=pipeline,accuracy=total['correctCore']/total['matched'],jointCoreF1=2*total['correctCore']/(total['detected']+total['reference']),confusion=np.sum([r['confusion'] for r in group],axis=0).tolist());summaries.append(total)
            if mode=='all':print(json.dumps(total),flush=True)
    assert next(r['correctCore'] for r in summaries if r['mode']=='all' and r['pipeline']=='baseline_pooled')==639
    (OUT/'report.json').write_text(json.dumps({'frozen':frozen,'summaries':summaries,'recordings':rows},indent=2))
if __name__=='__main__':main()
