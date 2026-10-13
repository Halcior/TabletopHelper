import fitz,json,hashlib,collections,argparse
from pathlib import Path
parser=argparse.ArgumentParser(description='Extract factual geometry from Event Companion v1.0 pages 9–53.')
parser.add_argument('--pdf',required=True)
parser.add_argument('--output',default='src/domain/battlefield/officialLayouts.json')
args=parser.parse_args()
source=Path(args.pdf)
doc=fitz.open(source)
assert len(doc)==93 and 'VERSION 1.0' in doc[0].get_text(), 'Review the extractor against the new source version before generating geometry.'
order=['take-and-hold','purge-the-foe','disruption','reconnaissance','priority-assets']
pairs=[(a,b) for i,a in enumerate(order) for b in order[i:]]
red=(.61795985699,.0399633795,.05568017065)
blue=(0,.2406042516,.4083619416)
green=(0,.4517891109,.3776302636)
teal=(.1283436269,.5709162951,.5179675221)
def colour(a,b): return a is not None and all(abs(x-y)<.002 for x,y in zip(a,b))
layouts={}
for idx in range(8,53):
 page=doc[idx]; paths=page.get_drawings()
 frames=[d for d in paths if d['type']=='s' and 335<d['rect'].width<345 and 455<d['rect'].height<470 and d['rect'].y0>250]
 assert frames,idx
 board=frames[-1]['rect']
 def point(p): return [round((p.x-board.x0)/board.width,6),round((p.y-board.y0)/board.height,6)]
 def svg(d,close=False):
  commands=[];prev=None
  for item in d['items']:
   kind=item[0]
   if kind in ('l','c'):
    start=point(item[1])
    if start!=prev: commands.append('M '+' '.join(map(str,start)))
    if kind=='l': commands.append('L '+' '.join(map(str,point(item[2]))));prev=point(item[2])
    else: commands.append('C '+' '.join(str(v) for p in item[2:] for v in point(p)));prev=point(item[-1])
   elif kind=='re':
    r=item[1]; pts=[point(fitz.Point(r.x0,r.y0)),point(fitz.Point(r.x1,r.y0)),point(fitz.Point(r.x1,r.y1)),point(fitz.Point(r.x0,r.y1))]
    commands.append('M '+' '.join(map(str,pts[0])))
    for p in pts[1:]:commands.append('L '+' '.join(map(str,p)))
    commands.append('Z');prev=pts[0]
   else:raise ValueError((idx,kind))
  if close:commands.append('Z')
  return ' '.join(commands)
 deployments={}
 for role,c in [('attacker',red),('defender',blue)]:
  shapes=[d for d in paths if colour(d['fill'],c) and (d['rect'].width>70 or d['rect'].height>100) and len(d['items'])>=1 and board.intersects(d['rect'])]
  shapes.sort(key=lambda d:d['rect'].width*d['rect'].height,reverse=True)
  assert shapes,(idx,role)
  deployments[role]=svg(shapes[0],True)
 objectives={'homeAttacker':[],'homeDefender':[],'central':[],'expansion':[]}
 for d in paths:
  r=d['rect']
  if not (24<r.width<30 and 24<r.height<30 and board.contains(r) and len(d['items'])==4):continue
  k=None
  if all(it[0]=='c' for it in d['items']):
   if colour(d['fill'],red): k='homeAttacker'
   elif colour(d['fill'],blue): k='homeDefender'
   elif colour(d['fill'],green): k='central'
  elif all(it[0]=='l' for it in d['items']) and colour(d['fill'],teal):k='expansion'
  if k:
   x,y=point(fitz.Point((r.x0+r.x1)/2,(r.y0+r.y1)/2));objectives[k].append({'x':x,'y':y})
 for k,points in objectives.items():objectives[k]=sorted(points,key=lambda p:(p['y'],p['x']))
 assert len(objectives['homeAttacker'])==len(objectives['homeDefender'])==1,(idx,objectives)
 assert len(objectives['central'])<=2 and len(objectives['expansion'])<=2,(idx,objectives)
 boundaries=[]
 for d in paths:
  if d['type']=='s' and d['dashes'] not in (None,'[] 0') and (d['rect'].width>300 or d['rect'].height>400) and board.intersects(d['rect']):
   path=svg(d)
   if path not in boundaries:boundaries.append(path)
 if not boundaries:
  print('Boundary not emitted as a dashed vector:',idx+1)
  if all(max((d['rect'].height for d in paths if colour(d['fill'],c)),default=0)>450 for c in (red,blue)):
   boundaries=['M 0.5 0 L 0.5 1']
  elif all(max((d['rect'].width for d in paths if colour(d['fill'],c)),default=0)>330 for c in (red,blue)):
   boundaries=['M 0 0.5 L 1 0.5']
  else: raise ValueError(('Needs manual boundary verification',idx+1))
 pair=pairs[(idx-8)//3]; variant='ABC'[(idx-8)%3]
 name='|'.join([*pair,variant])
 layouts[name]={'page':idx+1,'dispositions':list(pair),'variant':variant,'widthCm':111.76,'heightCm':152.4,'deploymentPaths':deployments,'territoryPaths':boundaries,'objectives':objectives}
print('Layouts:',len(layouts))
print('Actual objective counts:',collections.Counter(sum(len(v) for v in d['objectives'].values()) for d in layouts.values()))
out=Path(args.output)
out.write_text(json.dumps({'source':{'url':'https://assets.warhammer-community.com/eng_12-06_warhammer40000_event_companion-s3bfb5f9s1-ivswuij3fo.pdf','version':'1.0','checkedAt':'2026-10-13','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'method':'Objective glyph centres and deployment paths normalized from the published vector diagrams. Dashed Territory paths are transcribed where emitted as vectors; eleven straight centre dividers follow the published half-battlefield definition and diagram orientation. Not a physical measurement engine.'},'layouts':layouts},ensure_ascii=False,indent=2)+'\n')
