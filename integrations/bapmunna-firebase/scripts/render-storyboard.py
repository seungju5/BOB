"""Render the verified video manifest as a single-page Korean production script."""
import argparse
import json
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

parser = argparse.ArgumentParser()
parser.add_argument("--media", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
parser.add_argument("--font-regular", required=True, type=Path)
parser.add_argument("--font-bold", required=True, type=Path)
args = parser.parse_args()
story = json.loads((args.media / "storyboard.json").read_text())
pdfmetrics.registerFont(TTFont("Body", str(args.font_regular)))
pdfmetrics.registerFont(TTFont("Strong", str(args.font_bold)))
args.output.parent.mkdir(parents=True, exist_ok=True)
doc = canvas.Canvas(str(args.output), pagesize=A4)
doc.setTitle("밥뭇나 소개 영상 - 장면별 대본")
doc.setAuthor("밥뭇나 프로젝트")
W, H = A4
INK, MUTED, LINE = "#3D3024", "#75634C", "#E5DCCA"


def rect(x, y, w, h, color, radius=0):
    doc.setFillColor(colors.HexColor(color))
    doc.setStrokeColor(colors.HexColor(color))
    doc.roundRect(x, y, w, h, radius, fill=1, stroke=0)


def label(text, x, y, size=10, color=INK, bold=False):
    doc.setFillColor(colors.HexColor(color))
    doc.setFont("Strong" if bold else "Body", size)
    doc.drawString(x, y, text)


def paragraph(text, x, top, width, size=9.2, leading=13.2, color=INK):
    style = ParagraphStyle("line", fontName="Body", fontSize=size, leading=leading,
                           textColor=colors.HexColor(color))
    item = Paragraph(escape(text), style)
    _, height = item.wrap(width, H)
    item.drawOn(doc, x, top - height)
    return height


def stamp(seconds):
    minutes = int(seconds // 60)
    sec = seconds % 60
    return f"{minutes:02d}:{sec:05.2f}"


rect(0, 0, W, H, "#FFFCF5")
rect(34, 765, 4, 43, "#F6CD48", 2)
label("밥뭇나 소개 영상", 49, 790, 23, bold=True)
label("밥 한 끼로 전하는 안부 · 장면별 대본", 50, 770, 10.5, MUTED)
label("2026.10.17", W - 95, 798, 8.5, MUTED)
label("DEMO DAY / V1", W - 113, 782, 7.5, MUTED)
rect(34, 722, W - 68, 30, "#F8E9B4", 10)
label(f"{story['duration']:.2f}초   /   7장면   /   1920 × 1080   /   24fps   /   한국어 음성·자막", 48, 733, 9.4, bold=True)
paragraph("구성 의도: 걱정에서 시작해, 작은 소식을 확인하고 사람이 직접 안부를 나누는 흐름.", 35, 708, W - 70, 9, 13, MUTED)

titles = ["반가운 첫인사", "우리가 시작한 질문", "밥솥 신호가 안부로", "어르신의 세 가지 행동", "보호자의 안부 확인", "서로 다른 하루의 구분", "다정한 연결로 마무리"]
directions = ["토끼가 두 번 가볍게 점프 후 안착", "보호자·어르신의 두 대화 카드", "실제 체험 화면: 신호 전 → 반영 후", "실제 어르신 홈과 큰 버튼 3개", "실제 보호자 홈과 안부 묻기 동선", "연결 끊김 화면, 결식과 구분", "브랜드·토끼와 다음 검증 단계"]
row_top, row_h = 681, 77
for i, (scene, timing) in enumerate(zip(story["scenes"], story["timing"])):
    top, bottom = row_top - i * row_h, row_top - (i + 1) * row_h
    doc.setStrokeColor(colors.HexColor(LINE))
    doc.setLineWidth(.5)
    doc.line(34, bottom, W - 34, bottom)
    label(f"0{i + 1}", 35, top - 17, 12, bold=True)
    label(stamp(timing["start"]), 35, top - 34, 7.4, MUTED)
    label("- " + stamp(timing["start"] + timing["duration"]), 35, top - 45, 7.4, MUTED)
    doc.drawImage(str(args.media / "preview" / (scene["id"] + ".jpg")), 91, top - 67,
                  width=108, height=60.75, preserveAspectRatio=True, mask="auto")
    label(titles[i], 212, top - 15, 10, bold=True)
    height = paragraph(scene["narration"], 212, top - 24, W - 246, 9.1, 12.6)
    if height > 38:
        raise ValueError(f"Narration overflow in scene {scene['id']}: {height}")
    label(directions[i], 212, bottom + 8, 7.2, MUTED)

rect(34, 66, W - 68, 60, "#F1ECDD", 10)
label("발표 시 꼭 구분할 내용", 47, 108, 9.5, bold=True)
paragraph("가상 데이터 기반 시제품입니다. 밥그릇은 기록을 표현하며 실제 섭취량·건강을 판단하지 않습니다. 센서·가족 간 전송·전화·자동 신고가 실제 연결된 영상은 아닙니다.", 47, 98, W - 94, 8.6, 12, MUTED)
label("화면: 로컬 앱 실제 캡처 · 음성: macOS Yuna 합성 음성 · 음악 없음", 35, 47, 7.5, MUTED)
label("시나리오 원본과 자막은 영상과 함께 제공됩니다.", 35, 34, 7.5, MUTED)
label("1 / 1", W - 58, 34, 7.5, MUTED)
doc.showPage()
doc.save()
print(args.output)
