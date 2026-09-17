source=open('scripts/train-spectrogram.py').read();exec(source.split("model=Network().to(device)")[0])
from sklearn.neighbors import KNeighborsClassifier
model=Network();model.load_state_dict(torch.load('artifacts/spectrogram-model.pt',weights_only=True));model.eval();embedding=nn.Sequential(*list(model.layers.children())[:-1]);out=[]
with torch.no_grad():
 for batch in np.array_split(X,80):out.append(embedding(torch.from_numpy(batch)).numpy())
Z=np.concatenate(out);np.save('artifacts/embeddings.npy',Z)
for count in [3,5,10]:
 truth=[];pred=[]
 for person in range(21,29):
  for mode in ['Fixed','Personal']:
   match=(p==person)&np.array([r['mode']==mode for r in rows]);train=[]
   for label in range(4):train.extend(np.where(match&~improv&(y==label))[0][:count])
   test=np.where(match&improv)[0]
   if len(train)<count*4:continue
   knn=KNeighborsClassifier(n_neighbors=3,weights='distance').fit(Z[train],y[train]);truth.extend(y[test]);pred.extend(knn.predict(Z[test]))
 print(count,accuracy_score(truth,pred),len(truth),flush=True)
