"""Build the separate onboarding board from the approved brand assets."""
from pathlib import Path
from base64 import b64encode
from html import escape

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ASSETS = ROOT / "integrations/bapmunna-firebase/docs/assets"
CANVAS, PAPER, INK, BUTTER = "#F2EDE1", "#FFFDF7", "#3C3026", "#F8D14A"
SOFT, LINE, MUTED, GREEN = "#F6EFDF", "#E8DFCA", "#665747", "#42683C"
parts = []

def rect(x,y,w,h,fill=PAPER,r=16,stroke=None):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"' +
                 (f' stroke="{stroke}"' if stroke else '') + '/>')

def text(x,y,value,size=17,weight=400,color=INK):
    family = 'Kakao Big Sans' if weight >= 700 else 'Kakao Small Sans'
    for i,line in enumerate(value.split("\n")):
        parts.append(f'<text x="{x}" y="{y+i*round(size*1.48)}" font-family="{family}, Noto Sans KR, Arial" '
                     f'font-size="{size}" font-weight="{weight}" fill="{color}">{escape(line)}</text>')

def image(x,y,side,kind):
    parts.append(f'<use xlink:href="#asset-{kind}" transform="translate({x} {y}) scale({side/100})"/>')

def separator(y):
    parts.append(f'<path d="M24 {y}H366" stroke="{LINE}"/>')

def button(y,label,primary=True):
    rect(24,y,342,54,BUTTER if primary else PAPER,15,None if primary else LINE)
    text(41,y+35,label,18,700)

def tile(y,label,description,h=83,tone=SOFT):
    rect(24,y,342,h,tone,16,LINE if tone==PAPER else None)
    text(41,y+29,label,18,700)
    text(41,y+54,description,15,400,MUTED)

def phone(id,x,y,label,step=0,welcome=False):
    parts.append(f'<g id="{id}" transform="translate({x} {y})">')
    text(0,-19,label,18,700)
    rect(0,0,390,844,PAPER,29,LINE)
    if not welcome: image(22,15,34,"logo")
    text(24 if welcome else 62,40,"밥뭇나",23,700)
    if not welcome: text(291,39,"보호자용",15,700,MUTED)
    separator(59)
    if not step: return
    for j,name in enumerate(("계정","앱 안내","우리 집"),1):
        at=24+(j-1)*116
        rect(at,76,110,32,BUTTER if j==step else SOFT,16)
        text(at+10,98,f"{j} {name}",14,700)

def title(value,subtitle,y=159):
    text(24,y,value,29,700)
    text(24,y+98 if "\n" in value else y+44,subtitle,16,400,MUTED)
    image(251,103,134,"cooker")

def end():
    rect(149,825,92,4,INK,2)
    parts.append("</g>")

parts.append("<defs>")
for label,name in [("bunny","bunny.png"),("logo","rice-logo.png"),("cooker","rice-cooker-companion.png")]:
    data=b64encode((ASSETS/name).read_bytes()).decode("ascii")
    parts.append(f'<image id="asset-{label}" width="100" height="100" xlink:href="data:image/png;base64,{data}"/>')
parts.append("</defs>")
defs = "".join(parts)

rect(0,0,2235,3275,CANVAS,0)
text(52,56,"워밍업  /  밥뭇나  /  통합 온보딩  /  최종 흐름",17,700,MUTED)
text(52,116,"작은 신호를, 다정한 안부로.",43,700)
text(52,157,"카카오·Google 로그인 → 5장 앱 안내 → 우리 집 설정 → 보호자 홈",23,700)
text(52,196,"밥솥은 준비되면 홈에서 연결해요. 기존 기본 온보딩과 API 시안은 각각 보존해요.",18,400,MUTED)
text(52,263,"A   처음 시작하기",24,700)
text(313,263,"기기 연결 없이도 홈에 들어갈 수 있어요.",18,400,MUTED)

phone("A00_Welcome",52,312,"A-00   공통 시작 · 토끼",welcome=True)
text(24,151,"오늘도",42,700)
text(24,211,"밥은",42,700)
text(24,271,"드셨을까요?",42,700)
image(122,276,232,"bunny")
text(24,510,"매일 쓰는 밥솥이 대신 전하는 안부",17,400,MUTED)
button(580,"어르신으로 시작")
button(650,"보호자로 시작",False)
text(25,755,"앱 안내 다시 보기",16,700,MUTED)
end()

phone("A01_Account",487,312,"A-01   보호자 계정",1)
image(98,119,194,"cooker")
text(24,300,"보호자님, 반가워요.",29,700)
tile(329,"먼저 내 계정으로 시작해요.","밥솥은 홈에 들어간 뒤 연결해도 돼요.")
button(445,"카카오로 시작하기")
button(512,"Google로 시작하기",False)
tile(591,"이메일로 시작하기   ＋","이메일 링크로 가입하거나 로그인해요.",78,PAPER)
button(696,"로그인 없이 체험하기",False)
end()

phone("A02_Tutorial",922,312,"A-02   5장 앱 안내 · 마지막 장",2)
text(24,153,"●   ●   ●   ●   ●",15,700,MUTED)
text(284,153,"5 / 5",15,700,MUTED)
title("먼저 우리 집을\n알려 주세요","평소 끼니와 가족 정보를 알려 주세요.",218)
image(100,324,190,"cooker")
tile(504,"기기 연결은 홈에서","플러그가 없어도 먼저 시작할 수 있어요.",88,PAPER)
button(649,"우리 집 알려주기")
button(716,"건너뛰기",False)
end()

phone("A03_Household",1357,312,"A-03   어떤 댁인지 알려 주세요",3)
title("어떤 댁인지\n알려 주세요.","이름과 호칭을 먼저 알려 주세요.")
tile(284,"어르신 호칭·성함","예: 어머니 · 정숙",77,PAPER)
tile(372,"평소 끼니와 시간   ＋","하루 3끼 · 식사 시간은 변경할 수 있어요.",77,PAPER)
tile(461,"생활·밥솥 자세히   ＋","가구, 반려견, 연락처, 보온과 취사",77,PAPER)
tile(550,"언제 알려 드릴까요?   ＋","끼니·공복·건강 위험 안내 기준",77,PAPER)
rect(24,640,342,55,SOFT,16)
rect(41,658,20,20,PAPER,5,LINE);text(73,675,"안부 알림·생활 리포트 동의 (선택)",15,700)
button(728,"저장하고 홈으로")
end()

phone("A04_Home",1792,312,"A-04   홈 · 기기 연결 안내")
title("어머니와 나누는\n오늘의 안부","11월 12일 목요일 · 예시",129)
rect(24,271,342,59,INK,16)
text(39,309,"↓  여기서 기기를 연결해 주세요",17,700,PAPER)
text(309,309,"나중에",13,400,PAPER)
tile(345,"기기 연결이 필요해요   →","준비되면 여기서 연결해요.",86)
tile(446,"이번 주 리포트","기기 없이도 화면을 둘러볼 수 있어요.",81,PAPER)
tile(542,"오늘의 끼니","확인된 끼니 소식 2개 · 예시",90,"#EAF0E9")
image(259,546,111,"cooker")
text(25,682,"그림 속 밥의 양은 기록 수를 뜻해요.",15,400,MUTED)
text(25,709,"실제 드신 양은 알 수 없어요.",15,400,MUTED)
button(740,"설정에서 바꾸기",False)
end()

text(52,1220,"B   홈에서 선택하는 기기 연결",24,700)
text(469,1220,"기기 연결은 홈 입장 조건이 아니에요. 삼성 계정 허용과 신호 확인은 구분해요.",18,400,MUTED)

phone("B01_Settings",52,1273,"B-01   설정 · 기기")
title("설정","알림·생활 기준과 기기를 관리해요.",130)
for idx,name in enumerate(("알림 기준","생활 기준","기기")):
    rect(24+idx*116,217,110,41,BUTTER if idx==2 else SOFT,15)
    text(35+idx*116,244,name,16,700)
tile(291,"기기","SmartThings에 전력 측정 플러그를 등록해요.",84)
button(400,"삼성 계정 연결 준비 상태 보기")
tile(479,"테스트 플러그 연결   ＋","개발자용 · 직접 조회 테스트",78,PAPER)
tile(579,"어르신 휴대폰 연결   ＋","나중에 연결 숫자를 받아도 돼요.",78,PAPER)
button(701,"보호자 홈으로",False)
end()

phone("B02_Consent",487,1273,"B-02   삼성 계정 · 읽기 동의")
title("우리 집 플러그를\n만나볼까요?","SmartThings 앱에 먼저 등록해 주세요.",137)
tile(308,"내가 고른 기기만, 내 계정에","기기 목록과 연결 상태를 읽어요.")
parts.append('<a xlink:href="https://app.notion.com/p/4163d756e70080399649fedbb690842f?source=copy_link" target="_blank">'
             '<text x="41" y="409" font-family="Kakao Small Sans, Noto Sans KR, Arial" font-size="14" '
             'fill="#625746" text-decoration="underline">개인정보 처리방침 보기</text></a>')
rect(24,421,342,104,SOFT,16);rect(41,445,22,22,PAPER,5,LINE)
text(76,464,"정보 이용 내용을 확인했어요.",17,700)
text(41,500,"신호는 식사 여부나 양을 뜻하지 않아요.",15,400,MUTED)
button(561,"SmartThings 연결하기")
text(25,647,"삼성 계정에서 읽기 권한을 확인해요.",15,400,MUTED)
button(697,"나중에 연결하기",False)
end()

phone("B03_Device",922,1273,"B-03   밥솥을 꽂은 기기 고르기")
title("밥솥에 꽂은\n플러그를 골라요.","삼성 계정을 확인한 뒤 보여요.",137)
tile(301,"주방 플러그   ›","전력 읽기 가능 · 예시 기기",82,PAPER)
tile(398,"작은방 플러그   ›","전력 읽기 가능 · 예시 기기",82,PAPER)
tile(503,"플러그가 보이지 않나요?","전력 측정이 가능한지 먼저 확인해요.")
button(643,"기기 목록 다시 확인",False)
button(705,"나중에 연결하기",False)
end()

phone("B04_Monitor",1357,1273,"B-04   모니터링 · 조회와 자동 수신")
title("주방 플러그","연결 상태와 시각을 따로 살펴요.",133)
tile(245,"직접 조회","성공 · 19:10 · 예시",88,"#EAF0E9")
tile(350,"새 신호 자동 수신","아직 기다리는 중이에요.",88,PAPER)
tile(455,"기다리는 동안에도 홈 이용","조회 성공만으로 자동 수신을 판단하지 않아요.",91)
button(591,"지금 상태 다시 확인")
button(658,"보호자 홈으로",False)
end()

phone("B05_Pending",1792,1273,"B-05   준비 중 · 다시 연결")
title("기기 연결을\n준비하고 있어요.","지금은 기기 없이 시작할 수 있어요.",137)
tile(303,"준비 중인 경우","홈에서 먼저 밥뭇나를 이용해요.",87)
tile(415,"권한이 바뀐 경우","삼성 계정 연결을 다시 확인해요.",87,PAPER)
tile(527,"기존 기록은 그대로예요","연결이 끊겨도 결식으로 보지 않아요.",87,PAPER)
button(663,"연결 가능 여부 다시 확인")
button(726,"홈으로 돌아가기",False)
end()

text(52,2201,"C   우리 집 설정 · 펼쳐 보기",24,700)
text(429,2201,"기존 가구·식사·밥솥·알림·휴대폰 설정을 살리고 필요한 항목만 펼쳐요.",18,400,MUTED)
phone("L01_Start",52,2330,"L-01   생활 설정 · 기본",3)
title("우리 집에 맞춰\n시작해요.","이름을 적고 필요한 것만 확인해요.")
text(24,300,"어르신을 어떻게 불러요?",18,700)
for idx,name in enumerate(("어머니","아버지","부모님")):
    rect(24+idx*116,315,110,43,BUTTER if idx==0 else PAPER,16,LINE)
    text(43+idx*116,342,name,16,700)
text(24,390,"어르신 성함",17,700)
rect(24,405,342,48,PAPER,14,LINE);text(41,435,"정숙",16)
tile(467,"평소 끼니와 시간   ＋","하루 3끼 · 06:00 / 11:00 / 17:00",68,PAPER)
tile(546,"생활·밥솥 자세히   ＋","가구, 반려견, 연락처, 보온과 취사",68,PAPER)
tile(625,"언제 알려 드릴까요?   ＋","끼니 2회 · 공복 48시간 · 위험 72시간",68,PAPER)
button(716,"저장하고 홈으로")
text(24,803,"기기 없이도 설정할 수 있어요.",15,400,MUTED)
end()

phone("L02_Meals",487,2330,"L-02   평소 끼니와 시간 · 펼침",3)
title("평소에는\n언제 드세요?","우리 집 시간에 맞게 바꿀 수 있어요.")
text(24,299,"하루 평균 끼니 수",18,700)
for idx,name in enumerate(("1끼","2끼","3끼")):
    rect(24+idx*116,314,110,43,BUTTER if idx==2 else PAPER,16,LINE)
    text(66+idx*116,341,name,16,700)
for idx,(slot,hours) in enumerate((("아침","06:00   –   10:00"),("점심","11:00   –   14:30"),("저녁","17:00   –   21:00"))):
    at=383+idx*64
    rect(24,at,342,51,PAPER,14,LINE)
    text(41,at+33,slot,17,700); text(155,at+33,hours,17)
text(24,612,"일주일에 외식은 몇 번쯤?",18,700)
tile(628,"−             1번             +","외식하는 날은 직접 기록할 수 있어요.",84,SOFT)
text(24,778,"접기   −",17,700,MUTED)
end()

phone("L03_HomeAndCooker",922,2330,"L-03   생활·밥솥 자세히 · 펼침",3)
title("어떤 댁인지\n알려 주세요.","가구에 맞는 안부를 준비해요.")
tile(289,"함께 사는 분 (본인 포함)","1명   ·   2명   ·   3명 이상",80,PAPER)
tile(383,"반려견이 있나요?","없어요   ·   있어요",78,PAPER)
tile(475,"어르신 연락처 (선택)","홈에서 바로 전화할 때 쓰여요.",78,PAPER)
tile(567,"보온 기능을 쓰시나요?","켜 둬요   ·   안 써요",78,SOFT)
tile(659,"일주일에 밥은 몇 번 지으세요?","−             7번             +",78,SOFT)
text(24,787,"접기   −",17,700,MUTED)
end()

phone("L04_Alerts",1357,2330,"L-04   알림과 동의 · 펼침",3)
title("언제 알려\n드릴까요?","기본값을 두거나 필요에 맞게 조절해요.")
tile(291,"결식 알림","−             2끼             +",76,PAPER)
tile(380,"공복시간 주의","−           48시간           +",76,PAPER)
tile(469,"건강 위험 안내 기준","−           72시간           +",76,PAPER)
rect(24,565,342,134,SOFT,16)
rect(41,585,21,21,PAPER,5,LINE);text(74,603,"안부 알림·생활 리포트 동의 (선택)",15,700)
text(41,637,"밥솥 사용 신호만 살펴요. 신호만으로",15,400,MUTED)
text(41,664,"식사 여부나 양을 알 수 없어요.",15,400,MUTED)
text(24,757,"밥솥 연결에서 이미 확인했다면 다시 묻지 않아요.",14,400,MUTED)
end()

phone("L05_WelcomeAndPair",1792,2330,"L-05   기기 설정의 휴대폰 연결",3)
title("함께 안부를\n챙겨요.","입력한 설정을 간단히 확인해요.")
tile(291,"정숙 어머니 댁","1명 · 하루 3끼 · 예시",82,"#EAF0E9")
tile(387,"밥솥은 준비되는 대로","지금은 플러그 없이도 시작할 수 있어요.",82,SOFT)
tile(483,"어르신 휴대폰 연결 (선택)   ＋","지금 연결하거나 나중에 설정에서도 돼요.",82,PAPER)
text(24,612,"연결 숫자 받기",17,700)
text(24,645,"어르신 휴대폰에서 ‘어르신으로 시작’을 눌러요.",14,400,MUTED)
button(716,"설정 닫기")
end()
text(52,3224,"이 다섯 화면은 모두 ‘3 생활 설정’에 속해요.  ·  기본값과 성함은 디자인 예시예요.",17,400,MUTED)


svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
       'width="2235" height="3275" viewBox="0 0 2235 3275">' + "".join(parts) + '</svg>')
(HERE/"bapmunna-unified-onboarding.svg").write_text(svg, encoding="utf-8")
print("Built fifteen editable screen groups:", len(svg), "characters")
