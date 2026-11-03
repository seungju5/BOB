from pathlib import Path
import base64,html
root=Path(__file__).resolve().parents[2]
out=root/'design/2026-11-03-bapmunna';out.mkdir(parents=True,exist_ok=True)
asset=root/'integrations/bapmunna-firebase/docs/assets'
images={k:'data:image/png;base64,'+base64.b64encode((asset/f).read_bytes()).decode() for k,f in {'bunny':'bunny.png','logo':'rice-logo.png'}.items()}
pieces=['<defs>'+''.join(f'<image id="art-{k}" width="100" height="100" href="{v}" preserveAspectRatio="xMidYMid meet"/>' for k,v in images.items())+'</defs>']
def rect(x,y,w,h,fill='#FFFEFA',r=16,stroke=None):
 pieces.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"'+(f' stroke="{stroke}"' if stroke else '')+'/>')
def txt(x,y,text,size=17,color='#493C2C',weight=400):
 for i,line in enumerate(text.split('\n')):pieces.append(f'<text x="{x}" y="{y+i*size*1.5}" font-family="Noto Sans KR, Arial" font-size="{size}" font-weight="{weight}" fill="{color}">{html.escape(line)}</text>')
def mascot(x,y,size=90,kind='bunny',tag='hero'):
 pieces.append(f'<use xlink:href="#art-{kind}" transform="translate({x} {y}) scale({size/100})"/>')
def button(y,label,primary=True):
 rect(24,y,342,54,'#F6D457' if primary else '#FFFEFA',14,None if primary else '#DFD5C2');txt(42,y+35,label,17,weight=650)
def line(y):pieces.append(f'<path d="M24 {y}H366" stroke="#E9E1D1"/>')
def phone(i,x,y,title,sub):
 pieces.append(f'<g id="{i}_{title}" transform="translate({x} {y})">')
 txt(0,-24,f'{i:02d} / {sub}',18,weight=650)
 rect(0,0,390,844,'#FFFCF5',28,'#DCCFB5');mascot(20,12,32,'logo',f'brand{i}');txt(62,35,'밥뭇나',22,weight=700);txt(278,33,'보호자용',14,color='#796C55');line(54)
def end():
 rect(145,824,100,5,'#473D31',3);pieces.append('</g>')
rect(0,0,1370,2290,'#F3EDDF',0)
txt(60,70,'작은 신호를, 다정한 안부로.',38,weight=750)
txt(60,112,'밥뭇나  ·  캐릭터 / 로그인 / SmartThings 연결',22,color='#76674E')
txt(60,147,'2026.11.03  |  화면 설계 시안 · 아래 기기 이름과 연결 시각은 예시입니다.',16,color='#76674E')
rect(60,185,1250,250,'#FFFCF5',24)
mascot(85,210,170,'bunny','boardBunny');txt(280,242,'안부 친구',14,color='#927440',weight=650);txt(280,278,'초록 가디건 3D 토끼',25,weight=700);txt(280,315,'처음 인사부터 로그인과 연결까지,\n늘 곁에서 다정하게 안내해요.',17)
mascot(690,238,105,'logo','boardLogo');txt(830,242,'밥뭇나의 이름표',14,color='#927440',weight=650);txt(830,278,'노란 밥솥 로고',25,weight=700);txt(830,315,'밥 한 끼로 전하는 안부.\n작은 로고도 잘리지 않게 보여요.',17)
txt(85,405,'원칙  |  캐릭터의 표정은 식사 여부나 건강 상태를 뜻하지 않아요.',15,color='#76674E')
phone(1,60,505,'Login','로그인')
mascot(155,81,96,'bunny','loginBunny');txt(53,208,'보호자님, 반가워요.',27,weight=700);txt(80,242,'멀리 있어도, 안부는 가까이.',16,color='#7C705D')
txt(24,298,'이메일',15);rect(24,311,342,54,stroke='#DDD3BF');txt(40,346,'name@example.com',15,color='#A0937F')
txt(24,396,'비밀번호',15);rect(24,409,342,54,stroke='#DDD3BF');txt(40,444,'비밀번호를 입력해 주세요.',15,color='#A0937F')
rect(24,486,18,18,'#FFFCF5',4,'#BEB19B');txt(52,501,'로그인 상태 유지',15)
button(530,'로그인');button(598,'Google로 계속하기',False);txt(77,690,'회원가입    ·    비밀번호 찾기',15,color='#76674E');txt(24,738,'보호자 본인의 계정으로 시작해요.\n어르신의 기록은 자동 연결되지 않아요.',15,color='#76674E');end()
phone(2,490,505,'Consent','한 번만 허용')
mascot(282,73,90,'bunny','consentBunny')
txt(24,104,'우리 집 플러그를',28,weight=700);txt(24,145,'만나볼까요?',28,weight=700);txt(24,187,'기기가 보내는 소식을 받을 준비예요.',16,color='#7C705D')
for j,t in enumerate(['밥뭇나 로그인   ·   완료','삼성 계정으로 허용   ·   다음','우리 집 플러그 선택']):
 rect(24,222+j*62,32,32,'#F6EAC9',16);txt(35,244+j*62,str(j+1),15,weight=700);txt(70,244+j*62,t,16)
rect(24,427,342,205,'#F8F1E3',18);txt(42,459,'내가 고른 기기만, 내 계정에',17,weight=700);txt(42,493,'허용한 기기 목록을 읽고, 선택한\n플러그 이름과 신호 도착 시각을 저장해요.\n연결 열쇠는 서버에 암호화해 보관해요.',14,color='#76674E');rect(42,585,18,18,'#FFFCF5',4,'#BEB19B');txt(70,599,'확인하고 연결할게요.',15)
button(662,'SmartThings 연결하기');txt(77,749,'삼성 계정 화면으로 이동해요.',15,color='#76674E');end()
phone(3,920,505,'Device','내 플러그 선택')
mascot(284,67,80,'bunny','deviceBunny')
txt(24,100,'삼성 계정 확인 완료 · 3 / 3',14,color='#876D39',weight=650);txt(24,155,'밥솥에 꽂은 플러그를',27,weight=700);txt(24,196,'골라 주세요.',27,weight=700);txt(24,242,'현재 전력을 읽을 수 있는 기기만 보여요.',15,color='#76674E')
for j,t in enumerate(['주방 플러그','작은방 플러그']):
 rect(24,282+j*115,342,93,'#FFFEFA',18,'#DCC78D');rect(42,307+j*115,42,42,'#F9EDCC',12);txt(55,335+j*115,'~',24,color='#9A782B');txt(101,319+j*115,t,18,weight=700);txt(101,348+j*115,'현재 전력 읽기 가능',14,color='#82745F');txt(334,334+j*115,'›',26)
rect(24,548,342,112,'#F8F1E3',18);txt(42,579,'플러그가 보이지 않나요?',17,weight=700);txt(42,612,'SmartThings 앱에 먼저 등록하고\n전력 측정 지원 여부를 확인해 주세요.',14,color='#76674E')
button(704,'계정 연결 취소',False);end()
phone(4,60,1435,'Connected','연결 확인')
mascot(265,132,100,'bunny','connectedBunny')
rect(24,89,56,56,'#E7EEDB',28);txt(40,127,'✓',30,color='#547248',weight=700);txt(24,182,'연결 설정 완료',14,color='#6B795B',weight=700);txt(24,226,'주방 플러그',28,weight=700);txt(24,267,'기기 신호를 받았어요.',17,color='#6B795B')
for j,(a,b) in enumerate([('마지막 기기 신호','11월 3일 오후 12:05'),('자동 수신 확인','11월 3일 오후 12:05'),('직접 확인한 시각','11월 3일 오후 12:03')]):
 yy=320+j*87;txt(24,yy,a,14,color='#8B7E68');txt(24,yy+33,b,19,weight=600);line(yy+52)
rect(24,572,342,78,'#F8F1E3',16);txt(41,600,'신호가 늦어도 식사를 거른 뜻은 아니에요.\n이 화면은 기기 연결만 확인해요.',14,color='#76674E')
button(674,'지금 연결 확인하기');button(738,'연결 해제',False);end()
phone(5,490,1435,'Reconnect','다시 연결')
mascot(283,74,80,'bunny','reconnectBunny')
txt(24,103,'다시 연결 필요',14,color='#9A6D31',weight=700);txt(24,153,'삼성 계정 연결을',28,weight=700);txt(24,194,'한 번 확인해 주세요.',28,weight=700);txt(24,245,'허용 기간이 끝났거나\n권한이 바뀌었을 수 있어요.',17,color='#76674E')
rect(24,328,342,177,'#F8F1E3',18);txt(42,362,'내가 고른 기기만, 내 계정에',17,weight=700);txt(42,397,'연결 정보를 다시 확인하고\n원할 때 언제든 해제할 수 있어요.',15,color='#76674E');rect(42,455,18,18,'#FFFCF5',4,'#BEB19B');txt(70,470,'확인하고 연결할게요.',15)
button(548,'삼성 계정 다시 연결');button(617,'기존 연결 지우기',False);txt(24,721,'연결이 끊겼다고 식사 기록을\n“식사 안 함”으로 바꾸지 않아요.',16,color='#76674E');end()
phone(6,920,1435,'Setup','출시 전 준비 상태')
mascot(155,84,96,'bunny','setupBunny');txt(24,207,'우리 집 기기와',28,weight=700);txt(24,248,'만날 준비를 해요.',28,weight=700);txt(24,300,'연결 기능을 준비하고 있어요.\n준비가 끝나면 여기서 시작할 수 있어요.',16,color='#76674E')
rect(24,393,342,141,'#F8F1E3',18);txt(42,429,'먼저 준비할 수 있어요.',18,weight=700);txt(42,468,'SmartThings 앱에 플러그 등록하기\n밥뭇나 계정으로 로그인하기',15,color='#76674E')
button(581,'밥뭇나 로그인하기');button(650,'준비 상태 다시 확인',False);txt(24,751,'실제 삼성 등록·서버 설정·실기기 검증이\n끝나기 전에는 준비 중으로 보여요.',14,color='#76674E');end()
svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1370" height="2330" viewBox="0 0 1370 2330">'+''.join(pieces)+'</svg>'
(out/'bapmunna-connection-board.svg').write_text(svg)
print('Created SVG handoff:',round(len(svg)/1024/1024,2),'MiB')
