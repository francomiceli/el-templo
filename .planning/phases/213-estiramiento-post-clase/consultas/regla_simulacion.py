# Simulación de la regla de selección propuesta (solo para armar la tabla de referencia del SPEC).
CAT = {  # familia -> [(ejercicio, lados)] en orden
 'LS': [('QUAD STANDING STRETCH',2),('SITTED GLUTE STRETCH',2),('WARRIOR STRETCH',2),('LAYED DOWN GLUTE STRETCH',2),('COUCH STRETCH',2)],
 'MN': [('PIKE STANDING',1),('STR PIKE STANDING',1),('LAYED DOWN HAM BENT',2),('STANDING WINDMILL',2)],
 'FL': [('CAT COW',1),('TABLE',1),('SHOULDER BRIDGE',1),('SEAL REPS',1),('TABLE TWIST',2)],
 'TTB':[('STANDING LATERAL STRETCH',2)],
 'TS': [('WALL CHEST STRETCH',2),('BUTCHER FLOOR STRETCH',1),('LAY DOWN ARMS UP',1),('COBRA STRETCH',1),('ANGELS AND DEMONS',1)],
}
BASE = ['CAT COW','PIKE STANDING','QUAD STANDING STRETCH','WALL CHEST STRETCH','STANDING LATERAL STRETCH']
FAM_OF = {e:f for f,l in CAT.items() for e,_ in l}
LADOS = {e:n for l in CAT.values() for e,n in l}
DBFAM = {'LS ( LUNGES )':'LS','MN':'MN','FL':'FL','PL':'FL','TTB / HF':'TTB'}
TREN_SUP = {'HS','HSPU','PHS','OAPU','PLPU','MU','OAP','OAR','BL'}  # las 9 rutas sin ambigüedad (D-03)
DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado']
N, SEG, TRANS, MIN, MAX = 5, 45, 10, 300, 480

def dur(sel): return sum(LADOS[e]*SEG for e in sel) + TRANS*len(sel)

def regla(week, day, prescritos, rutas):
    fams, cnt = [], {}
    for ej, dbf in prescritos:
        f = FAM_OF.get(ej) or DBFAM.get(dbf)
        if not f: continue
        if f not in cnt: fams.append(f)
        cnt[f] = cnt.get(f,0)+1
    fams.sort(key=lambda f: -cnt[f])          # estable: empate -> primera aparición
    if 'TS' not in fams and any(r in TREN_SUP for r in rutas): fams.append('TS')
    if not fams: fams = ['__BASE__']
    off = week + DIAS.index(day)
    cand = {}
    for f in fams:
        if f == '__BASE__': cand[f] = list(BASE); continue
        pres = [ej for ej,_ in prescritos if FAM_OF.get(ej)==f]
        pres = list(dict.fromkeys(pres))
        rest = [e for e,_ in CAT[f] if e not in pres]
        k = off % len(rest) if rest else 0
        cand[f] = pres + rest[k:] + rest[:k]
    sel, i, guard = [], 0, 0
    def take():
        nonlocal i, guard
        for _ in range(len(fams)):
            f = fams[i % len(fams)]; i += 1
            c = [e for e in cand[f] if e not in sel]
            if c: sel.append(c[0]); return True
        for e in BASE:
            if e not in sel: sel.append(e); return True
        return False
    while len(sel) < N and take(): pass
    while dur(sel) > MAX: sel.pop()
    while dur(sel) < MIN and take(): pass
    return fams, sel, dur(sel)

import csv, sys, collections
rows = [l.rstrip('\n').split('\t') for l in open(sys.argv[1])]
pres, rut = collections.OrderedDict(), {}
mode = 0
for r in rows:
    if r[0]=='day_id': mode += 1; continue
    if mode==1: pres.setdefault(r[0], {'modo':r[1],'p':[]})['p'].append((r[6], r[7]))
    elif mode==2 and len(r)==2 and r[0].startswith('W'): rut[r[0]] = [b.split(':')[1] for b in r[1].split(' ') if not b.startswith('INITIUM')]
for d,v in pres.items():
    w, day, lvl = d.split('-'); w = int(w[1:])
    fams, sel, t = regla(w, day, v['p'], rut[d])
    print(f"{d} | {v['modo']} | rutas {','.join(rut[d])} | fam {'>'.join(fams)} | {t//60}:{t%60:02d} | " + ' · '.join(f"{e}{' x2' if LADOS[e]==2 else ''}" for e in sel))
