"""Editable SVG handoff from the same assets and tokens as the application."""
from pathlib import Path
import json,base64,html
root=Path(__file__).resolve().parents[2]
out=Path(__file__).resolve().parent
m=json.loads((out/'design-manifest.json').read_text());t=m['tokens'];parts=[]
def rect(x,y,w,h,fill,rx=0,stroke=None):
 parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'+(f' stroke="{stroke}"' if stroke else '')+'/>')
def text(x,y,s,size=20,color=None,weight=400):
 parts.append(f'<text x="{x}" y="{y}" font-family="Pretendard, Noto Sans KR, sans-serif" font-size="{size}" font-weight="{weight}" fill="{color or t["ink"]}">{html.escape(s)}</text>')
def image(x,y,w,h,name):
 data=base64.b64encode((root/'public/brand'/name).read_bytes()).decode()
 parts.append(f'<image x="{x}" y="{y}" width="{w}" height="{h}" href="data:image/png;base64,{data}"/>')
rect(0,0,1200,1160,t['canvas'])
text(56,76,'밥뭇나 · 함께 쓰는 디자인',38,weight=750)
text(56,117,'APP  ·  API SCREENS  ·  FIGMA  ·  GITHUB     /     2026.11.03',16,t['muted'])
rect(48,154,1104,218,t['paper'],28)
image(74,182,82,82,'rice-logo.png');text(170,237,'밥뭇나',38,weight=750)
text(82,303,'밥 한 끼로 전하는 안부',26,weight=650)
text(82,340,'토끼는 안부 친구 · 밥솥은 브랜드 심볼',18,t['muted'])
image(907,170,190,190,'bunny.png')
text(56,422,'01  같은 색, 같은 서체',24,weight=700)
for i,(key,label) in enumerate([('paper','크림 바탕'),('yellow','주요 선택'),('ink','본문·제목'),('green-soft','확인 상태'),('red-soft','도움 요청')]):
 x=56+i*220;rect(x,450,200,66,t[key],16, t['line'] if key=='paper' else None);text(x,544,label,18,weight=650);text(x,571,t[key].upper(),16,t['muted'])
text(56,614,'본문 Pretendard  ·  브랜드 NanumPen  ·  본문 16px 이상  ·  터치 48px 이상',18,t['muted'])
rect(48,654,536,211,t['paper'],24);text(72,697,'02  어르신에게는 세 가지 행동',24,weight=700)
for i,label in enumerate(m['seniorActions']):
 x=72+i*164;rect(x,727,150,76,t['red-soft'] if i==2 else t['soft'],20);text(x+14,773,label,21,weight=750)
text(72,840,'큰 글씨 · 한 번의 확인 · 사진 촬영 요구 없음',16,t['muted'])
rect(608,654,544,211,t['paper'],24);text(632,697,'03  탐색은 세 곳으로',24,weight=700)
for i,label in enumerate(m['navigation']):
 x=632+i*165;rect(x,727,150,76,t['yellow'] if i==0 else t['soft'],20);text(x+46,773,label,21,weight=750)
text(632,840,'홈 · 기록 · 더보기에서 알림과 설정으로',16,t['muted'])
rect(48,889,1104,220,t['paper'],24);text(72,932,'04  연결 상태를 솔직하고 편안하게',24,weight=700)
rect(72,958,112,36,t['soft'],18);text(91,982,'준비 중',17,weight=650)
text(203,984,'공개 삼성 API 미배포 · 실제 OAuth / 자동 수신은 아직 미검증',18,t['muted'])
text(72,1030,'로그인 → 삼성 동의 → 기기 선택 → 연결 확인 · 오류와 재연결도 같은 디자인',18)
text(72,1075,'Firebase / Supabase의 계정과 데이터 권한은 각각 유지해요.',17,t['muted'])
(out/'bapmunna-design-system.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1160" viewBox="0 0 1200 1160">'+''.join(parts)+'</svg>')
print('Generated editable design system SVG from approved asset hashes.')
