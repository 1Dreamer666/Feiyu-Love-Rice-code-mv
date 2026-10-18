# -*- coding: utf-8 -*-
"""调整 CAST 手臂参数：避免大弯角触发 keepX 折叠，让抱碗/护碗/递碗姿态正确。"""
import io, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
gen = os.path.join(BASE, 'integrate_cast.py')
s = io.open(gen, encoding='utf-8').read()

old = """    function castArms(pose) {
      switch (pose) {
        case 'sing':       return { lArm: 33, lBend: 132, lHold: 'mic' };
        case 'holdBowl':   return { lArm: 30, lBend: 116, rArm: 30, rBend: 116 };
        case 'hugBowl':    return { lArm: 26, lBend: 126, rArm: 26, rBend: 126 };
        case 'poutHips':   return { lArm: 16, lBend: 94, rArm: 16, rBend: 94 };
        case 'eureka':     return { rArm: 150, rBend: 6, lArm: 16, lBend: 88 };
        case 'shareRice':  return { lArm: 76, lBend: 24, rArm: 76, rBend: 24 };
        case 'countToken': return { rArm: 42, rBend: 116, lArm: 20, lBend: 94 };
        case 'sleepDesk':  return { lArm: 48, lBend: 58, rArm: 48, rBend: 58 };
        default:           return { lArm: 19, lBend: 20, rArm: 19, rBend: 20 };
      }
    }"""

new = """    function castArms(pose) {
      switch (pose) {
        case 'sing':       return { lArm: 33, lBend: 132, lHold: 'mic' };
        // 抱碗/护碗：上臂略外张、前臂收到胸前，用 lHold 的 fold 让双手落在胸腹前
        case 'holdBowl':   return { lArm: 34, lBend: 112, rArm: 34, rBend: 112, lFront: true, rFront: true };
        case 'hugBowl':    return { lArm: 30, lBend: 118, rArm: 30, rBend: 118, lFront: true, rFront: true };
        case 'poutHips':   return { lArm: 22, lBend: 86, rArm: 22, rBend: 86 };
        case 'eureka':     return { rArm: 150, rBend: 6, lArm: 18, lBend: 82 };
        // 递碗：双臂向前平举
        case 'shareRice':  return { lArm: 82, lBend: 16, rArm: 82, rBend: 16, lFront: true, rFront: true };
        case 'countToken': return { rArm: 46, rBend: 108, lArm: 22, lBend: 90 };
        case 'sleepDesk':  return { lArm: 52, lBend: 54, rArm: 52, rBend: 54 };
        default:           return { lArm: 19, lBend: 20, rArm: 19, rBend: 20 };
      }
    }"""

if old not in s:
    raise SystemExit('castArms not found')
s = s.replace(old, new)
io.open(gen, 'w', encoding='utf-8').write(s)
print('castArms patched')
