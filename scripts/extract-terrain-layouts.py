"""Extract factual outlines, not raster art, from a hash-pinned Event Companion.

Requires PyMuPDF. No fitting to invented symmetric templates; every placement is
read independently. All terrain paths use ONE physical scale, in both axes.
"""
import argparse, collections, hashlib, json, math, runpy, sys, tempfile
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--pdf', required=True)
parser.add_argument('--doubles', required=True)
parser.add_argument('--footprints', required=True)
parser.add_argument('--downloads', required=True, help='Official /api/search/downloads/ response')
args = parser.parse_args()
FILES = {'event': Path(args.pdf), 'doubles': Path(args.doubles), 'footprints': Path(args.footprints)}
EXPECTED = {'event':'187253a9b6ea377f5e44d1148454bd042b165b03bb5c45c51a5880762bf56dc2', 'doubles':'752d8887a8821e55199cdf80cdf954daeeda450b4b1836bfe989f321293c9f44', 'footprints':'abda484efe1e3031a92079053594a8b933a6ac429b899151f39ce8d51cbb9189'}
for name, path in FILES.items():
    assert hashlib.sha256(path.read_bytes()).hexdigest() == EXPECTED[name], f'Review changed {name} source before extraction'
D = fitz.open(FILES['event'])
assert len(D) == 93 and 'VERSION 1.3' in D[0].get_text()
assert 'VERSION 1.1' in fitz.open(FILES['doubles'])[0].get_text()
meta = {h['id']['title']: h['id'] for h in json.loads(Path(args.downloads).read_text())['hits']}
sources = {}
for key, title, version, pages in [('event','Warhammer Event Companion','1.3',[7,8,*range(9,54)]), ('doubles','Warhammer Doubles - Event Companion','1.1',[1,2]), ('footprints','Armageddon',None,[1,2,3])]:
    m = meta[title]
    day, month, year = m['last_updated'].split('/')
    sources[key] = {'url': 'https://assets.warhammer-community.com/'+m['file'], 'version': version,
                    'updatedAt': f'{year}-{month}-{day}', 'checkedAt': '2026-10-21',
                    'sha256': hashlib.sha256(FILES[key].read_bytes()).hexdigest(), 'pages': pages}

# Retain the established objective/deployment transcription. Its version guard is
# deliberately replaced only here after checking the exact new version above.
s = (ROOT/'scripts/extract-official-battlefields.py').read_text()
s = s.replace("'VERSION 1.0'", "'VERSION 1.3'")
with tempfile.TemporaryDirectory() as temp:
    sys.argv = ['extract-official-battlefields.py','--pdf',args.pdf,'--output',temp+'/geometry.json']
    exec(compile(s, 'extract-official-battlefields.py', 'exec'), {'__name__':'__main__'})
    data = json.loads(Path(temp+'/geometry.json').read_text())
data['source'] = {**sources['event'], 'id':'event-1.3-2026-10-14',
 'method':'Independent PDF vector outlines and glyph centres; single physical scale per board. No raster artwork. Nominal dimensions refer to p7; Armageddon perimeter protrusions are retained.',
 'precisionNote':'Diagram-derived placement, not surveyed physical terrain. The source board frame differs from 44:60 by up to the recorded frame error. Do not infer sub-millimetre accuracy from displayed decimals.'}
data['sources'] = sources
kind_by_items = {29:'A',33:'B',23:'C',40:'D',67:'E'}
nominal = {'A':(6,4,4,3),'B':(10,2.5,2,1),'C':(6,2,4,2),'D':(7,11.5,4,3),'E':(8,11.5,2,1)}
data['footprintLibrary'] = {k: {'type':k, 'nominalWidthCm':w*2.54,'nominalHeightCm':h*2.54,
    'quantity':q,'shape':'polygon','templateSourcePage':p} for k,(w,h,q,p) in nominal.items()}

def colour(a,b): return a is not None and all(abs(x-y)<.002 for x,y in zip(a,b))
def contour(d):
    result=[]
    for item in d['items']:
        if item[0]=='l':
            if not result: result.append(item[1])
            result.append(item[2])
        elif item[0]=='c':
            if not result: result.append(item[1])
            a,b,c,e=item[1:]
            # 12 samples per cubic: retained source boundary, no decorative fill.
            for i in range(1,13):
                t=i/12;u=1-t
                result.append(fitz.Point(u**3*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t**3*e.x,u**3*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t**3*e.y))
        else: raise ValueError(item[0])
    return result

def inside(p, points):
    c=False
    for a,b in zip(points,points[1:]+points[:1]):
        if (a.y>p.y)!=(b.y>p.y) and p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x:c=not c
    return c

def simplify(points, tolerance):
    # RDP limited to 0.15mm in board space; never replace a shape by its bbox.
    if len(points)<3:return points
    a,b=points[0],points[-1];vx=b.x-a.x;vy=b.y-a.y;length=vx*vx+vy*vy
    def distance(p):
        t=max(0,min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/length)) if length else 0
        return math.hypot(p.x-a.x-t*vx,p.y-a.y-t*vy)
    i=max(range(1,len(points)-1),key=lambda j:distance(points[j]))
    if distance(points[i])<=tolerance:return [a,b]
    return simplify(points[:i+1],tolerance)[:-1]+simplify(points[i:],tolerance)

legacy=json.loads((ROOT/'src/domain/battlefield/officialLayouts.legacy.json').read_text())
audit=[]
for key, layout in data['layouts'].items():
    page=D[layout['page']-1];paths=page.get_drawings()
    board=[d['rect'] for d in paths if d['type']=='s' and 335<d['rect'].width<345 and 455<d['rect'].height<470 and d['rect'].y0>250][-1]
    scale=111.76/board.width
    offsetY=(152.4-board.height*scale)/2
    physical=lambda p:fitz.Point((p.x-board.x0)*scale,(p.y-board.y0)*scale+offsetY)
    areas=[d for d in paths if d['type']=='fs' and colour(d['fill'],(.8202029467,.8260013461,.8322880864)) and board.contains(d['rect'])]
    assert collections.Counter(kind_by_items[len(d['items'])] for d in areas)==collections.Counter({'A':4,'B':2,'C':4,'D':4,'E':2}),layout['page']
    layout['layoutId']=key;layout['edition']=11;layout['rulesVersion']=data['source']['id'];layout['sourceHash']=sources['event']['sha256']
    layout['frameAspectErrorPercent']=round(abs(board.height*scale/152.4-1)*100,4)
    layout['terrainAreas']=[];layout['terrainFeatures']=[]
    ids=collections.Counter();raw={}
    for d in sorted(areas,key=lambda d:(d['rect'].y0,d['rect'].x0)):
        kind=kind_by_items[len(d['items'])];ids[kind]+=1;areaId=f'{kind}{ids[kind]}'
        points=contour(d);raw[areaId]=points
        # Rotation relative to the longest straight source edge; clockwise in y-down coordinates.
        edges=[it for it in d['items'] if it[0]=='l'];edge=max(edges,key=lambda it:abs(it[2]-it[1]))
        angle=math.atan2(edge[2].y-edge[1].y,edge[2].x-edge[1].x)
        if kind in ['D','E']:angle+=math.pi/2
        # Source bbox centre defines a stable table coordinate, distinct from objective centres.
        centre=physical((d['rect'].tl+d['rect'].br)/2)
        cs=math.cos(-angle);sn=math.sin(-angle)
        vertices=[]
        for p in simplify(points,.015/scale):
            p=physical(p)-centre
            vertices.append({'x':round(p.x*cs-p.y*sn,4),'y':round(p.x*sn+p.y*cs,4)})
        xs=[p['x'] for p in vertices];ys=[p['y'] for p in vertices]
        layout['terrainAreas'].append({'id':areaId,'footprintType':kind,'position':{'x':round(centre.x,4),'y':round(centre.y,4)},
            'widthCm':round(max(xs)-min(xs),4),'heightCm':round(max(ys)-min(ys),4),
            'rotationDeg':round(math.degrees(angle)%360,3),'polygonPoints':vertices})
    # Only explicitly green component badges certify Dense features. Unlabelled
    # images may contain dense AND light features: never infer Light from absence.
    dense=[d['rect'].tl+(d['rect'].br-d['rect'].tl)/2 for d in paths if d['type']=='fs' and colour(d['fill'],(0,.4517891109,.3776302636)) and 15<d['rect'].width<18]
    for area in layout['terrainAreas']:
        marks=[p for p in dense if inside(p,raw[area['id']])]
        if marks: area['terrainFeatureClass']='dense'
        for n,p in enumerate(marks):
            layout['terrainFeatures'].append({'id':area['id']+'-feature-'+str(n+1),'terrainAreaId':area['id'],
                'class':area['terrainFeatureClass'],'position':({'x':round(physical(p).x,4),'y':round(physical(p).y,4)} if p else area['position'])})
    # Preserve existing objective IDs. An E-E pair can form ONE objective area.
    layout['objectiveAssignments']={}
    for category,positions in layout['objectives'].items():
        for n,p in enumerate(positions):
            objectiveId={'homeAttacker':'attacker-home','homeDefender':'defender-home','central':f'CENTER-{n+1}','expansion':f'EXPANSION-{n+1}'}[category]
            point=fitz.Point(board.x0+p['x']*board.width,board.y0+p['y']*board.height)
            matches=[areaId for areaId,shape in raw.items() if inside(point,shape)]
            if not matches:
                # The printed glyph can straddle adjacent areas: intersect its
                # documented 27pt symbol footprint, not an invented nearest neighbour.
                glyph=fitz.Rect(point.x-13.5,point.y-13.5,point.x+13.5,point.y+13.5)
                matches=[areaId for areaId,shape in raw.items() if any(glyph.contains(p) for p in shape)]
            assert matches,(layout['page'],objectiveId)
            layout['objectiveAssignments'][objectiveId]=matches
    # Explicit source certification is distinct from schema checks / physical playtest.
    layout['verification']={'status':'vector-extracted','checkedAt':'2026-10-21','physicalTableChecked':False}
    old=legacy['layouts'][key]
    changed=[f for f in ['objectives','deploymentPaths','territoryPaths'] if old[f]!=layout[f]]
    audit.append({'layoutId':key,'page':layout['page'],'areas':len(areas),'changedLegacyFields':changed,'legacyObjectiveCounts':{k:len(v) for k,v in old['objectives'].items()},'currentObjectiveCounts':{k:len(v) for k,v in layout['objectives'].items()},'frameAspectErrorPercent':layout['frameAspectErrorPercent']})
(ROOT/'src/domain/battlefield/officialLayouts.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
(ROOT/'docs/terrain-source-audit.json').write_text(json.dumps({'sources':sources,'layouts':audit,'maxFrameAspectErrorPercent':max(a['frameAspectErrorPercent'] for a in audit)},indent=2)+'\n')
print('45 maps; 720 independent source outlines; changed legacy fields:',collections.Counter(f for row in audit for f in row['changedLegacyFields']))
