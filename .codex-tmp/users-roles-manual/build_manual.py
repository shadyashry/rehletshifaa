from pathlib import Path
from textwrap import wrap
from datetime import date

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(r"C:\Users\hp\Projects\rehletshifaa")
OUT = ROOT / "docs" / "platform-control-plane"
ASSETS = OUT / "users-roles-manual-assets"
DOCX = OUT / "rehletshifaa-users-and-roles-manual.docx"

NAVY = "143A52"
TEAL = "0D7D82"
BLUE = "2B6F9C"
GOLD = "C9962E"
GREEN = "4F7D62"
RED = "9A3E45"
INK = "20252A"
MID = "5C6872"
LIGHT = "EAF3F8"
PALE = "F5F8FA"
BORDER = "D9D9D9"
WHITE = "FFFFFF"


def font(size, bold=False):
    paths = [
        (r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf"),
        (r"C:\Windows\Fonts\calibrib.ttf" if bold else r"C:\Windows\Fonts\calibri.ttf"),
    ]
    for p in paths:
        if Path(p).exists():
            return ImageFont.truetype(p, size=size)
    return ImageFont.load_default()


F_TITLE = font(46, True)
F_H1 = font(34, True)
F_H2 = font(26, True)
F_BODY = font(22, False)
F_SMALL = font(18, False)
F_BOLD = font(22, True)
F_CARD = font(18, True)


def hexrgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def draw_wrapped(draw, xy, text, fnt, fill, width_chars, spacing=5, anchor=None):
    lines = []
    for paragraph in text.split("\n"):
        lines.extend(wrap(paragraph, width=width_chars) or [""])
    draw.multiline_text(xy, "\n".join(lines), font=fnt, fill=fill, spacing=spacing, anchor=anchor)


def rounded(draw, box, fill, outline=NAVY, width=3, radius=24):
    draw.rounded_rectangle(box, radius=radius, fill=hexrgb(fill), outline=hexrgb(outline), width=width)


def arrow(draw, start, end, color=MID, width=5):
    draw.line([start, end], fill=hexrgb(color), width=width)
    x2, y2 = end
    x1, y1 = start
    dx, dy = x2 - x1, y2 - y1
    length = max((dx * dx + dy * dy) ** 0.5, 1)
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    tip = (x2, y2)
    p1 = (x2 - 18 * ux + 10 * px, y2 - 18 * uy + 10 * py)
    p2 = (x2 - 18 * ux - 10 * px, y2 - 18 * uy - 10 * py)
    draw.polygon([tip, p1, p2], fill=hexrgb(color))


def canvas():
    return Image.new("RGB", (1600, 900), "white")


def save(img, name):
    path = ASSETS / name
    img.save(path, quality=95)
    return path


def diagram_populations():
    img = canvas(); d = ImageDraw.Draw(img)
    d.text((800, 52), "Who uses RehletShifaa", font=F_TITLE, fill=hexrgb(INK), anchor="ma")
    items = [
        ("Platform governance", "Account Owner\nSystem Administrators", NAVY),
        ("RehletShifaa teams", "Care coordination\nTravel and logistics\nCommercial and finance\nProvider operations\nCredentialing and review", TEAL),
        ("Provider organizations", "Organization Owners\nPractice Managers\nConsultants\nAssociate Doctors\nConsultant Assistants", BLUE),
        ("Patients", "Patients\nPatient Representatives", GREEN),
    ]
    x_positions = [60, 450, 840, 1230]
    for (title, body, color), x in zip(items, x_positions):
        rounded(d, (x, 180, x + 310, 720), LIGHT if color != GREEN else "EDF5EF", color, 4)
        d.ellipse((x + 105, 215, x + 205, 315), fill=hexrgb(color))
        d.text((x + 155, 265), title.split()[0][0], font=F_TITLE, fill="white", anchor="mm")
        d.text((x + 155, 350), title, font=F_H2, fill=hexrgb(INK), anchor="ma")
        draw_wrapped(d, (x + 155, 440), body, F_BODY, hexrgb(INK), 24, 13, "ma")
    d.text((800, 820), "One platform  Four user populations  Clear boundaries", font=F_H2, fill=hexrgb(MID), anchor="mm")
    return save(img, "figure-01-user-populations.png")


def diagram_governance():
    img = canvas(); d = ImageDraw.Draw(img)
    d.text((800, 45), "Platform governance and operational authority", font=F_TITLE, fill=hexrgb(INK), anchor="ma")
    rounded(d, (540, 120, 1060, 245), "F3E8C9", GOLD, 4)
    d.text((800, 165), "Platform Account Owner", font=F_H1, fill=hexrgb(INK), anchor="ma")
    d.text((800, 215), "Approves administrator changes and ownership transfer", font=F_SMALL, fill=hexrgb(INK), anchor="ma")
    arrow(d, (800, 250), (800, 320), NAVY)
    rounded(d, (540, 325, 1060, 450), LIGHT, NAVY, 4)
    d.text((800, 365), "System Administrators", font=F_H1, fill=hexrgb(INK), anchor="ma")
    d.text((800, 415), "Manage staff lifecycle and access governance", font=F_SMALL, fill=hexrgb(INK), anchor="ma")
    for x in [245, 560, 875, 1190]:
        arrow(d, (800, 455), (x, 555), TEAL, 4)
    labels = [
        "Care delivery teams\nCoordination  Travel  Finance",
        "Provider governance\nProvider operations  Credentialing",
        "Content and identity\nJourneys  Patient identity",
        "Independent oversight\nCompliance audit",
    ]
    for x, label in zip([80, 395, 710, 1025], labels):
        rounded(d, (x, 560, x + 300, 760), PALE, TEAL, 3)
        draw_wrapped(d, (x + 150, 645), label, F_BODY, hexrgb(INK), 26, 10, "mm")
    d.text((800, 830), "The owner and administrators do not receive clinical case access by position alone", font=F_BOLD, fill=hexrgb(RED), anchor="mm")
    return save(img, "figure-02-platform-governance.png")


def diagram_provider_tree():
    img = canvas(); d = ImageDraw.Draw(img)
    d.text((800, 40), "One person across organizations clinics and roles", font=F_TITLE, fill=hexrgb(INK), anchor="ma")
    rounded(d, (575, 100, 1025, 200), "EDF5EF", GREEN, 4)
    d.text((800, 135), "Dr Sara Haddad", font=F_H1, fill=hexrgb(INK), anchor="ma")
    d.text((800, 178), "One identity and one practitioner profile", font=F_SMALL, fill=hexrgb(INK), anchor="ma")
    orgs = [
        (80, "Al Noor Healthcare Group", "Owner organization wide\nConsultant at Dubai and Sharjah"),
        (575, "Gulf Heart Center", "Practice Manager at Main Clinic"),
        (1070, "Crescent Medical", "Associate Doctor at Rehab Clinic\nUnder active supervision"),
    ]
    for x, title, body in orgs:
        arrow(d, (800, 205), (x + 225, 315), BLUE, 4)
        rounded(d, (x, 320, x + 450, 520), LIGHT, BLUE, 4)
        d.text((x + 225, 360), title, font=F_H2, fill=hexrgb(INK), anchor="ma")
        draw_wrapped(d, (x + 225, 420), body, F_BODY, hexrgb(INK), 34, 8, "ma")
    facilities = [
        (80, "Dubai Clinic\nSharjah Clinic"),
        (575, "Gulf Heart Main"),
        (1070, "Crescent Rehab"),
    ]
    for x, label in facilities:
        arrow(d, (x + 225, 525), (x + 225, 610), TEAL, 4)
        rounded(d, (x + 55, 615, x + 395, 760), PALE, TEAL, 3)
        draw_wrapped(d, (x + 225, 680), label, F_H2, hexrgb(INK), 24, 8, "mm")
    d.text((800, 835), "Each organization membership and clinic affiliation has its own lifecycle", font=F_BOLD, fill=hexrgb(MID), anchor="mm")
    return save(img, "figure-03-multi-organization.png")


def diagram_scope_ladder():
    img = canvas(); d = ImageDraw.Draw(img)
    d.text((800, 45), "Access becomes narrower as the scope becomes more specific", font=F_TITLE, fill=hexrgb(INK), anchor="ma")
    levels = [
        (180, 125, 1420, 235, NAVY, "PLATFORM", "Across the RehletShifaa platform for the named capability"),
        (250, 260, 1350, 370, TEAL, "ASSIGNED ORGANIZATIONS", "Only the provider organizations assigned to the internal staff member"),
        (320, 395, 1280, 505, BLUE, "ORGANIZATION", "The provider organization and all current and future facilities"),
        (390, 530, 1210, 640, GOLD, "ASSIGNED FACILITIES", "Only the listed clinics or branches inside one organization"),
        (460, 665, 1140, 775, GREEN, "MANAGED CLINICIANS  SELF  ASSIGNED CASES", "Named relationships or the user own work only"),
    ]
    for x1, y1, x2, y2, color, title, body in levels:
        rounded(d, (x1, y1, x2, y2), "FFFFFF", color, 5)
        d.text(((x1 + x2) // 2, y1 + 30), title, font=F_H2, fill=hexrgb(color), anchor="ma")
        d.text(((x1 + x2) // 2, y1 + 76), body, font=F_SMALL, fill=hexrgb(INK), anchor="ma")
    d.text((800, 835), "A role answers what a person may do  The scope answers where they may do it", font=F_BOLD, fill=hexrgb(MID), anchor="mm")
    return save(img, "figure-04-access-scopes.png")


def diagram_offer_flow():
    img = canvas(); d = ImageDraw.Draw(img)
    d.text((800, 45), "Provider membership requires the person consent", font=F_TITLE, fill=hexrgb(INK), anchor="ma")
    steps = [
        (60, "1", "Organization sends offer", "Email starts discovery only"),
        (370, "2", "Identity is resolved", "One account is reused safely"),
        (680, "3", "Person reviews offer", "Organization clinics roles and dates"),
        (990, "4", "Person accepts or declines", "Manager roles require MFA"),
        (1300, "5", "Access becomes active", "Membership affiliation and roles activate together"),
    ]
    for x, num, title, body in steps:
        d.ellipse((x, 190, x + 120, 310), fill=hexrgb(TEAL))
        d.text((x + 60, 250), num, font=F_TITLE, fill="white", anchor="mm")
        rounded(d, (x - 35, 350, x + 155, 660), PALE, TEAL, 3)
        draw_wrapped(d, (x + 60, 405), title, F_CARD, hexrgb(INK), 15, 5, "ma")
        draw_wrapped(d, (x + 60, 520), body, F_BODY, hexrgb(INK), 16, 7, "ma")
    for x in [180, 490, 800, 1110]:
        arrow(d, (x, 250), (x + 150, 250), BLUE, 5)
    d.text((800, 745), "Nothing is active before acceptance", font=F_H1, fill=hexrgb(RED), anchor="mm")
    d.text((800, 815), "Declining or expiring one offer does not change other organizations", font=F_BOLD, fill=hexrgb(MID), anchor="mm")
    return save(img, "figure-05-provider-offer.png")


def diagram_lifecycle():
    img = canvas(); d = ImageDraw.Draw(img)
    d.text((800, 45), "Local actions stay local", font=F_TITLE, fill=hexrgb(INK), anchor="ma")
    rounded(d, (560, 115, 1040, 220), "EDF5EF", GREEN, 4)
    d.text((800, 160), "One global identity", font=F_H1, fill=hexrgb(INK), anchor="ma")
    d.text((800, 200), "Signs in once", font=F_SMALL, fill=hexrgb(INK), anchor="ma")
    cards = [
        (80, "Clinic affiliation ends", "Only that clinic access ends\nOther clinics stay active"),
        (430, "Organization membership ends", "Only that organization ends\nOther organizations stay active"),
        (780, "Facility is suspended", "Only resources at that facility deny\nSibling facilities stay active"),
        (1130, "Global account is disabled", "All memberships become inert\nReserved for compromise or authorized global action"),
    ]
    for x, title, body in cards:
        arrow(d, (800, 225), (x + 170, 350), RED if x == 1130 else BLUE, 4)
        rounded(d, (x, 355, x + 340, 690), PALE, RED if x == 1130 else BLUE, 4)
        draw_wrapped(d, (x + 170, 405), title, F_H2, hexrgb(INK), 24, 7, "ma")
        draw_wrapped(d, (x + 170, 520), body, F_BODY, hexrgb(INK), 27, 8, "ma")
    d.text((800, 785), "A local revocation never disables the person sign in account", font=F_H1, fill=hexrgb(RED), anchor="mm")
    return save(img, "figure-06-lifecycle-isolation.png")


def diagram_pricing():
    img = canvas(); d = ImageDraw.Draw(img)
    d.text((800, 45), "How the platform chooses a service price", font=F_TITLE, fill=hexrgb(INK), anchor="ma")
    levels = [
        (120, 135, 1480, 245, LIGHT, BLUE, "1 Clinician at this facility", "Most specific and used first"),
        (200, 270, 1400, 380, PALE, TEAL, "2 Facility price", "Used when no clinician at facility price exists"),
        (280, 405, 1320, 515, LIGHT, NAVY, "3 Clinician organization price", "Used when no facility level price exists"),
        (360, 540, 1240, 650, PALE, GOLD, "4 Organization default", "Used when no more specific price exists"),
        (440, 675, 1160, 785, LIGHT, GREEN, "5 Catalogue fallback", "Used only when the earlier levels are absent"),
    ]
    for x1, y1, x2, y2, fill, color, title, body in levels:
        rounded(d, (x1, y1, x2, y2), fill, color, 4)
        d.text((x1 + 35, y1 + 34), title, font=F_H2, fill=hexrgb(INK))
        d.text((x1 + 35, y1 + 74), body, font=F_SMALL, fill=hexrgb(MID))
    return save(img, "figure-07-pricing-precedence.png")


def diagram_example():
    img = canvas(); d = ImageDraw.Draw(img)
    d.text((800, 40), "Worked example access result", font=F_TITLE, fill=hexrgb(INK), anchor="ma")
    rounded(d, (60, 120, 1540, 235), "EDF5EF", GREEN, 4)
    d.text((800, 155), "Dr Sara uses one sign in across three independent provider organizations", font=F_H1, fill=hexrgb(INK), anchor="ma")
    d.text((800, 205), "Every action is checked against organization facility role status and professional eligibility", font=F_SMALL, fill=hexrgb(INK), anchor="ma")
    cols = [
        (70, "Al Noor", "Owner across organization\nConsultant at Dubai and Sharjah", "Can manage provider members and consult at two clinics\nCannot grant platform roles or approve own credentials", BLUE),
        (560, "Gulf Heart", "Practice Manager at Main Clinic", "Can manage assigned clinic operations\nCannot act at Gulf Heart West or self approve authored prices", TEAL),
        (1050, "Crescent Medical", "Associate Doctor at Rehab Clinic", "Can work under Dr Omar supervision\nCannot act as Consultant without local Consultant verification", GOLD),
    ]
    for x, title, role, result, color in cols:
        rounded(d, (x, 285, x + 450, 750), PALE, color, 4)
        d.text((x + 225, 330), title, font=F_H1, fill=hexrgb(color), anchor="ma")
        draw_wrapped(d, (x + 225, 405), role, F_H2, hexrgb(INK), 34, 9, "ma")
        draw_wrapped(d, (x + 225, 570), result, F_BODY, hexrgb(INK), 36, 9, "ma")
    d.text((800, 825), "Removing one assignment changes only that assignment", font=F_BOLD, fill=hexrgb(RED), anchor="mm")
    return save(img, "figure-08-worked-example.png")


def diagram_test_map():
    img = canvas(); d = ImageDraw.Draw(img)
    d.text((800, 40), "Tester coverage map", font=F_TITLE, fill=hexrgb(INK), anchor="ma")
    center = (800, 440)
    nodes = [
        (120, 110, "Identity", "one person one account"),
        (610, 80, "MFA", "strong sign in for sensitive roles"),
        (1110, 110, "Membership", "one lifecycle per organization"),
        (1180, 595, "Facility", "active clinic and affiliation"),
        (610, 680, "Compatibility", "professional and duty checks"),
        (50, 595, "Isolation", "no cross organization leakage"),
    ]
    for x, y, _title, _body in nodes:
        d.line([(x + 185, y + 75), center], fill=hexrgb(BLUE), width=4)
    for x, y, title, body in nodes:
        box = (x, y, x + 370, y + 150)
        rounded(d, box, PALE, TEAL, 3)
        d.text((x + 185, y + 30), title, font=F_H2, fill=hexrgb(INK), anchor="ma")
        d.text((x + 185, y + 87), body, font=F_SMALL, fill=hexrgb(MID), anchor="ma")
    d.ellipse((650, 290, 950, 590), fill=hexrgb(NAVY))
    d.text(center, "ROLE\nSCOPE\nCHECK", font=F_H2, fill="white", anchor="mm", spacing=8)
    return save(img, "figure-09-tester-map.png")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_row_cant_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    node = OxmlElement("w:cantSplit")
    tr_pr.append(node)


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, v in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn("w:" + m))
        if node is None:
            node = OxmlElement("w:" + m)
            tc_mar.append(node)
        node.set(qn("w:w"), str(v))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color=BORDER, size="6"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        element = borders.find(qn("w:" + edge))
        if element is None:
            element = OxmlElement("w:" + edge)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), size)
        element.set(qn("w:color"), color)


def set_cell_width(cell, inches):
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_w = tc_pr.find(qn("w:tcW"))
    if tc_w is None:
        tc_w = OxmlElement("w:tcW")
        tc_pr.append(tc_w)
    tc_w.set(qn("w:w"), str(int(inches * 1440)))
    tc_w.set(qn("w:type"), "dxa")


def font_run(run, size=10.5, bold=False, color=INK, italic=False):
    run.font.name = "Arial"
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Arial")
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Arial")
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def style_paragraph(p, after=5, before=0, line=1.08):
    fmt = p.paragraph_format
    fmt.space_after = Pt(after)
    fmt.space_before = Pt(before)
    fmt.line_spacing = line


def add_body(doc, text, bold_lead=None, italic=False):
    p = doc.add_paragraph()
    style_paragraph(p, after=6, line=1.12)
    if bold_lead and text.startswith(bold_lead):
        r1 = p.add_run(bold_lead)
        font_run(r1, 10.5, True)
        r2 = p.add_run(text[len(bold_lead):])
        font_run(r2, 10.5, False, italic=italic)
    else:
        r = p.add_run(text)
        font_run(r, 10.5, False, italic=italic)
    return p


def add_bullets(doc, items, level=0):
    for item in items:
        p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
        style_paragraph(p, after=3, line=1.08)
        font_run(p.add_run(item), 10.3)


def add_numbered(doc, items):
    for index, item in enumerate(items, start=1):
        p = doc.add_paragraph()
        style_paragraph(p, after=3, line=1.08)
        p.paragraph_format.left_indent = Inches(0.28)
        p.paragraph_format.first_line_indent = Inches(-0.28)
        font_run(p.add_run(str(index) + ".  "), 10.3, False, INK)
        font_run(p.add_run(item), 10.3)


def add_heading(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    p.paragraph_format.keep_with_next = True
    return p


def add_caption(doc, text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    style_paragraph(p, before=2, after=9)
    font_run(p.add_run(text), 9, False, MID, True)
    return p


def add_picture(doc, path, alt, width=7.0):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    style_paragraph(p, before=3, after=2)
    run = p.add_run()
    shape = run.add_picture(str(path), width=Inches(width))
    try:
        shape._inline.docPr.set("descr", alt)
        shape._inline.docPr.set("title", alt.split(".")[0][:120])
    except Exception:
        pass
    return p


def add_table(doc, headers, rows, widths=None, font_size=9.2, header_fill=NAVY, keep_together=False):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)
    hdr = table.rows[0]
    set_repeat_table_header(hdr)
    set_row_cant_split(hdr)
    for i, text in enumerate(headers):
        cell = hdr.cells[i]
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        set_cell_shading(cell, header_fill)
        set_cell_margins(cell, 110, 115, 110, 115)
        if widths:
            set_cell_width(cell, widths[i])
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        style_paragraph(p, after=0, line=1.0)
        p.paragraph_format.keep_with_next = True
        font_run(p.add_run(text), font_size, True, WHITE)
    for ri, row in enumerate(rows):
        new_row = table.add_row()
        set_row_cant_split(new_row)
        cells = new_row.cells
        for i, text in enumerate(row):
            cell = cells[i]
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            set_cell_margins(cell, 100, 115, 100, 115)
            if widths:
                set_cell_width(cell, widths[i])
            if ri % 2 == 1:
                set_cell_shading(cell, PALE)
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if len(str(text)) < 18 else WD_ALIGN_PARAGRAPH.LEFT
            style_paragraph(p, after=0, line=1.02)
            font_run(p.add_run(str(text)), font_size, False, INK)
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(2)
    return table


def add_role(doc, role, population, purpose, scope, can_do, cannot_do, mfa, handoff, test_focus):
    add_heading(doc, role, 2)
    intro = add_body(doc, purpose)
    intro.paragraph_format.keep_with_next = True
    add_table(
        doc,
        ["Role fact", "Plain language meaning"],
        [
            ("Population and scope", population + ". " + scope),
            ("May do", can_do),
            ("Must not do", cannot_do),
            ("Strong sign in", mfa),
            ("Typical handoff", handoff),
            ("Tester focus", test_focus),
        ],
        [1.65, 5.45],
        9.0,
        TEAL,
    )


def add_page_break(doc):
    doc.add_page_break()


def add_page_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run("Page ")
    font_run(run, 8.5, False, MID)
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = "PAGE"
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.append(fld_char1)
    run._r.append(instr_text)
    run._r.append(fld_char2)


def build_doc(diagrams):
    doc = Document()
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.65)
    section.bottom_margin = Inches(0.62)
    section.left_margin = Inches(0.72)
    section.right_margin = Inches(0.72)
    section.header_distance = Inches(0.28)
    section.footer_distance = Inches(0.28)
    section.different_first_page_header_footer = True

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Arial"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor.from_string(INK)
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.12

    title = styles["Title"]
    title.font.name = "Arial"
    title._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
    title._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
    title.font.size = Pt(28)
    title.font.bold = True
    title.font.color.rgb = RGBColor.from_string("000000")
    title_ppr = title._element.get_or_add_pPr()
    title_border = title_ppr.find(qn("w:pBdr"))
    if title_border is not None:
        title_ppr.remove(title_border)

    for name, size, space_before, space_after in [
        ("Heading 1", 18, 10, 5),
        ("Heading 2", 13.5, 8, 4),
        ("Heading 3", 11.5, 7, 3),
    ]:
        st = styles[name]
        st.font.name = "Arial"
        st._element.rPr.rFonts.set(qn("w:ascii"), "Arial")
        st._element.rPr.rFonts.set(qn("w:hAnsi"), "Arial")
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = RGBColor.from_string("000000")
        st.paragraph_format.space_before = Pt(space_before)
        st.paragraph_format.space_after = Pt(space_after)
        st.paragraph_format.keep_with_next = True

    for sec in doc.sections:
        hp = sec.header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
        font_run(hp.add_run("RehletShifaa Users Roles and Access Guide"), 8.5, False, MID)
        add_page_number(sec.footer.paragraphs[0])
        sec.first_page_header.paragraphs[0].text = ""
        sec.first_page_footer.paragraphs[0].text = ""

    # Cover
    p = doc.add_paragraph(style="Title")
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(48)
    p.paragraph_format.space_after = Pt(12)
    p.add_run("RehletShifaa Users Roles and Access Guide")
    ppr = p._p.get_or_add_pPr()
    pborder = ppr.find(qn("w:pBdr"))
    if pborder is not None:
        ppr.remove(pborder)
    p2 = doc.add_paragraph()
    style_paragraph(p2, after=14)
    font_run(p2.add_run("A plain language operating manual for platform owners provider organizations clinics staff and testers"), 15, False, MID)
    add_body(doc, "Edition 1  Target operating model  25 September 2026")
    add_picture(doc, diagrams["populations"], "Four user populations shown as platform governance RehletShifaa teams provider organizations and patients.", 7.0)
    add_body(doc, "This guide explains who each user is, where each role applies, what that person may do, what remains prohibited, and how to test the boundaries. It is suitable for a provider owner evaluating the platform and for delivery teams building or validating it.")
    p = doc.add_paragraph()
    style_paragraph(p, before=10, after=0)
    font_run(p.add_run("Document owner  RehletShifaa"), 9.5, True, NAVY)
    add_page_break(doc)

    # Opening
    add_heading(doc, "1 How to use this guide", 1)
    add_body(doc, "The agreed model is simple. A role states what a person may do. A scope states where that role applies. Access is granted only when the person, membership, organization, facility, assignment, and any professional eligibility are all active.")
    add_body(doc, "This document describes the approved target operating model. It is the behavior to build and test for the first production release. It should not be treated as proof that every feature is already available in the current development environment.")
    add_heading(doc, "Reader paths", 2)
    add_table(doc, ["Reader", "Start here", "Then use"], [
        ("Provider owner or buyer", "Sections 2 through 5", "Worked example and quick reference"),
        ("Clinic manager", "Provider organization roles", "Access scopes and lifecycle"),
        ("RehletShifaa manager", "Platform governance and internal roles", "Role combinations and handovers"),
        ("Tester", "Core model and scope rules", "Tester handbook and worked example"),
        ("Implementation team", "All role profiles", "Control rules and acceptance checks"),
    ], [1.7, 2.2, 3.2], 9.3)
    add_heading(doc, "Contents", 2)
    add_numbered(doc, [
        "The model in one page",
        "Platform governance roles",
        "RehletShifaa internal staff roles",
        "Provider organizations clinics and roles",
        "Patients representatives and non business identities",
        "Scopes role combinations and professional eligibility",
        "Invitations activation suspension and removal",
        "Services prices schedules cases and routing",
        "Tester handbook",
        "Worked example",
        "Quick reference and glossary",
    ])
    add_page_break(doc)

    # Core model
    add_heading(doc, "2 The model in one page", 1)
    add_heading(doc, "Four user populations", 2)
    add_body(doc, "RehletShifaa separates platform governance, internal operations, provider organizations, and patients. The boundaries prevent a provider manager from becoming a platform administrator and prevent an administrator from reading clinical information merely because they manage access.")
    add_picture(doc, diagrams["populations"], "Four populations of RehletShifaa users and the roles within each population.", 7.0)
    add_caption(doc, "Figure 1  The four user populations")
    add_heading(doc, "Seven facts every reader should know", 2)
    add_numbered(doc, [
        "One human has one sign in identity across the platform.",
        "A provider organization is the legal or contracting tenant.",
        "A clinic branch hospital or virtual site is a facility inside one provider organization.",
        "A person may belong to several provider organizations and several facilities.",
        "The same person may hold different compatible roles in different organizations or facilities.",
        "Ending one local role membership or facility affiliation does not disable access elsewhere.",
        "A global identity disable is reserved for compromise or an authorized platform wide action.",
    ])
    add_heading(doc, "The provider hierarchy", 2)
    add_picture(doc, diagrams["provider_tree"], "Dr Sara has one identity and practitioner profile with separate memberships roles and clinic affiliations in three organizations.", 7.0)
    add_caption(doc, "Figure 2  One person can work across organizations and clinics")
    add_bullets(doc, [
        "The identity and practitioner profile are shared across the platform.",
        "Each organization membership can start suspend or end independently.",
        "Each clinic affiliation and role assignment names the context where it applies.",
    ])
    add_page_break(doc)

    # Governance roles
    add_heading(doc, "3 Platform governance roles", 1)
    add_body(doc, "These roles govern the RehletShifaa platform account. They are separate from daily care delivery and from ownership of a provider organization.")
    add_picture(doc, diagrams["governance"], "The Platform Account Owner sits above System Administrators for governance approval while operational teams retain their own authority.", 7.0)
    add_caption(doc, "Figure 3  Governance and operational authority are separate")
    add_role(doc, "Platform Account Owner", "Platform governance", "The Platform Account Owner is the contractual root of trust for the RehletShifaa platform account. Ownership is a protected relationship, not a normal grantable role.", "Platform governance actions only", "Approve or reject System Administrator changes; transfer ownership; authorize handover administrators; restore administration if no administrator remains; emergency remove an administrator; review a governance summary.", "Read clinical cases or documents; manage finance or provider operations; grant normal staff roles; act as the owner of a provider organization merely because they own the platform account.", "Required for every owner action. Sensitive actions also require a recent sign in within five minutes.", "The owner approves administrator changes. System Administrators perform day to day staff and access administration.", "Verify that ownership alone grants no clinical operational financial provider or patient access. Verify transfer and emergency actions are audited.")
    add_role(doc, "System Administrator", "Platform governance and internal staff", "System Administrators manage people access and staff lifecycle without becoming clinical superusers. Two active holders are recommended.", "Platform access governance and staff administration", "Invite and manage internal staff; change jobs; grant compatible supplemental responsibilities; manage access assignments and relationships; view effective access and access audit; request or approve another administrator appointment or removal.", "Approve their own request; grant or revoke their own authority; read unrelated clinical cases; make finance credential identity provider or journey decisions; bypass role conflicts; remove the last administrator through the normal flow.", "Required on every request. Privileged actions require a recent sign in within five minutes.", "Hands operational work to the correct staff profile. Another administrator or the Platform Account Owner approves privileged administrator changes.", "Test no self service escalation no clinical bypass last administrator protection and owner controlled recovery when zero administrators remain.")
    add_heading(doc, "Administrator appointment rules", 2)
    add_table(doc, ["Situation", "Who starts it", "Who approves it", "Expected protection"], [
        ("Two or more administrators", "Any administrator", "Another administrator or the Platform Account Owner", "Requester approver and target must be different where required"),
        ("Exactly one administrator", "That administrator", "Platform Account Owner", "Last administrator remains until replacement is active"),
        ("No administrator after handover", "Platform Account Owner", "No second approval", "Strong sign in recent authentication reason and critical audit"),
        ("Emergency removal", "Platform Account Owner", "No second approval", "Explicit warning may temporarily leave zero administrators"),
        ("Owner also becomes administrator", "Another administrator", "Another administrator", "The owner never self requests or self approves"),
    ], [1.5, 1.45, 1.7, 2.45], 8.7)
    # Internal roles
    add_heading(doc, "4 RehletShifaa internal staff roles", 1)
    add_body(doc, "Internal staff remain RehletShifaa employees even when they cover a provider organization or clinic. They never appear as provider employees and cannot be invited into a provider organization by a provider manager.")
    add_heading(doc, "Internal role structure", 2)
    add_bullets(doc, [
        "Each internal staff member has one primary job or no primary job only when they are administration only.",
        "A person may also hold compatible supplemental responsibilities from the approved supplemental set.",
        "Operational jobs in coordination travel finance and provider operations are primary jobs because they control work queues reporting lines and case ownership.",
        "Access is governed by assignments and scope. The displayed job label does not create authority by itself.",
    ])
    add_role(doc, "Care Coordination Manager", "RehletShifaa internal staff", "Leads the coordination team and supervises the flow of patient cases through assigned provider organizations.", "Platform role with the organizations the manager serves", "Supervise coordination work; view team queues; transfer work; configure coordination pools and routing rules for covered organizations; perform coordination casework.", "Act outside covered organizations; perform finance travel credential provider administration or platform access governance unless separately and compatibly assigned.", "Required as internal staff.", "Receives staff setup from a System Administrator and hands cases to Care Coordinators or other operational teams.", "Verify team visibility transfer permissions and organization boundaries. A promotion from Coordinator keeps coordination authority and should not be blocked by owned cases.")
    add_role(doc, "Care Coordinator", "RehletShifaa internal staff", "Owns and progresses assigned coordination cases and connects patients providers and internal teams.", "Assigned cases and the organizations served", "Take ownership of eligible cases; work assigned coordination tasks; route or hand work to the appropriate next team under the workflow.", "Supervise the full coordination team; configure pools; access unrelated cases; perform travel finance credential or platform administration work.", "Required as internal staff.", "Escalates or transfers work to the Care Coordination Manager and hands approved work to travel finance or provider teams.", "Verify assigned case access and denial for unrelated cases organizations and facilities.")
    add_role(doc, "Travel and Logistics Manager", "RehletShifaa internal staff", "Supervises travel and logistics work connected to assigned patient journeys.", "Platform travel casework with supervisory authority", "Supervise travel cases; review team work; use lead level travel visibility; manage handoffs within the travel function.", "Change clinical decisions; manage finance policy; administer provider membership; access unrelated case data beyond the minimum travel workspace.", "Required as internal staff.", "Receives approved travel needs from coordination and hands completed arrangements back to the care workflow.", "Verify lead visibility is limited to travel work and that sensitive clinical fields are minimized.")
    add_role(doc, "Travel and Logistics Specialist", "RehletShifaa internal staff", "Plans and records travel arrangements for assigned cases.", "Assigned travel cases", "Build travel plans; record arrival and logistics milestones; complete assigned operations steps.", "Supervise the travel team; open unrelated cases; approve finance or clinical decisions.", "Required as internal staff.", "Works from coordination requirements and sends completed arrangements to the next workflow step.", "Verify access is limited to assigned travel cases and necessary information.")
    add_role(doc, "Commercial and Finance Manager", "RehletShifaa internal staff", "Owns commercial policy and supervises financial execution for patient cases.", "Platform finance casework and commercial policy", "Manage margin and deposit policy; manage foreign exchange rates and service templates; supervise finance casework; perform finance work when needed.", "Read unrelated clinical material; grant platform roles; make credential decisions; approve a decision when separation of duty requires another person.", "Required as internal staff.", "Sets policy used by Finance Officers and receives escalations or exceptions.", "Verify manager only capabilities for policy foreign exchange and templates and verify clinical data minimization.")
    add_role(doc, "Finance Officer", "RehletShifaa internal staff", "Executes the financial steps of assigned cases under approved commercial policy.", "Assigned finance cases", "Record deposits and payments; review and approve commercial terms within delegated authority; complete assigned finance tasks.", "Change margin deposit foreign exchange or service template policy; access unrelated cases; administer users.", "Required as internal staff.", "Receives approved terms and hands financial completion back to the patient journey.", "Verify assigned case limits and denial for policy administration.")
    add_role(doc, "Provider Operations Manager", "RehletShifaa internal staff", "Leads setup and operational governance of provider organizations covered by RehletShifaa.", "Platform provider creation plus assigned organizations or facilities", "Create provider organizations; activate or suspend providers; manage provider setup; invite provider members and clinicians for covered organizations; manage direct provider setup where applicable.", "Decide credentials for a clinician they invited or manage; become a provider employee; access patient clinical cases merely because they manage a provider.", "Required as internal staff.", "Creates and prepares providers then hands credential decisions to an independent Credentialing Specialist.", "Verify assigned organization boundaries and the independent review rule between provider operations and credentialing.")
    add_role(doc, "Provider Operations Specialist", "RehletShifaa internal staff", "Performs provider and clinician setup for assigned organizations under manager oversight.", "Assigned organizations or facilities", "View and update covered providers; invite provider members and clinicians; perform approved direct setup tasks.", "Activate or suspend providers when the manager capability is required; decide credentials for clinicians they invited or manage; act outside assigned coverage.", "Required as internal staff.", "Prepares the organization and clinicians for independent credential review and manager activation.", "Verify no provider activation authority and no credential decision for managed clinicians.")
    add_role(doc, "Credentialing Specialist", "RehletShifaa internal staff", "Provides independent review of clinician credentials for assigned organizations or facilities.", "Assigned organizations or facilities", "View credential dossiers; review evidence; request more information; verify reject or suspend credentials; decide direct clinician credentials where applicable.", "Review their own credentials; decide a clinician they invited or manage as Provider Operations; receive a Provider Operations role on the same person.", "Required as internal staff.", "Receives a complete dossier from provider operations or the clinician and returns an independent decision.", "Verify self review denial inviter reviewer separation facility scope and person level conflict with Provider Operations.")
    add_role(doc, "Patient Identity Reviewer", "RehletShifaa internal staff", "Reviews patient legal identity evidence and records an identity decision.", "Platform identity review function", "Open the identity review queue; inspect necessary identity evidence; approve reject or request further information according to policy.", "Read clinical documents or case details unrelated to identity evidence; perform staff administration or credential decisions.", "Required as internal staff.", "Receives an identity review task and returns the outcome to the patient workflow.", "Verify the role sees only identity review information and no general clinical documents.")
    add_role(doc, "Care Journey Manager", "RehletShifaa internal staff", "Authors and prepares reusable care journey definitions.", "Platform journey design", "View create and edit draft journeys; validate and simulate them; submit them for independent approval.", "Approve publish or retire their own journey; combine with Care Journey Approver on the same person.", "Required as internal staff.", "Submits a completed draft to a Care Journey Approver.", "Verify author and approver separation and that authoring grants no patient case access.")
    add_role(doc, "Care Journey Approver", "RehletShifaa internal staff", "Independently approves and publishes care journey definitions.", "Platform journey approval", "View submitted journeys; approve publish or retire journey versions.", "Author the journey they approve; combine with Care Journey Manager on the same person; access patient cases because of this role.", "Required as internal staff.", "Receives a submitted journey from the Care Journey Manager and publishes or rejects it.", "Verify maker checker separation and no clinical case access.")
    add_role(doc, "Compliance Auditor", "RehletShifaa internal staff", "Independently reviews access roles assignments and effective access.", "Platform access audit", "View role definitions; view effective access; review access audit history.", "Read clinical cases or documents; administer staff; change roles; combine with System Administrator on the same person.", "Required as internal staff.", "Reviews evidence produced by Access Governance without changing it.", "Verify read only access audit capability no clinical bypass and conflict with System Administrator.")
    # Provider side
    add_heading(doc, "5 Provider organizations clinics and roles", 1)
    add_body(doc, "A Provider Organization is the legal or contracting tenant. A Provider Facility is one operating site inside that organization. The user interface calls facilities Clinics and branches. Each facility belongs to exactly one organization.")
    add_heading(doc, "Organization and facility rules", 2)
    add_bullets(doc, [
        "An organization may own any number of clinics hospitals medical centers diagnostic centers rehabilitation centers and virtual care facilities.",
        "A legally independent site with its own contract is a separate Provider Organization rather than a branch.",
        "Each organization has one default facility for configuration and backfill. The default facility does not grant access.",
        "An organization cannot be active without at least one active facility.",
        "Suspending one facility blocks that facility but does not suspend sibling facilities.",
    ])
    add_role(doc, "Organization Owner", "Provider organization", "Owns the provider tenant and governs its provider members and operations. This role is different from the Platform Account Owner.", "Organization wide including all current and future facilities", "Manage provider members and organization level settings; govern clinics and branches; receive authority across all facilities within the organization; hold compatible provider roles when separation rules still apply.", "Grant platform or internal staff roles; create central RehletShifaa coverage; bypass self approval rules; see another organization; assume clinical eligibility from ownership.", "Required at launch.", "Delegates day to day work to Practice Managers and clinical work to eligible clinicians.", "Verify all facility inheritance including a newly created facility and denial for every platform staff and access governance action.")
    add_role(doc, "Practice Manager", "Provider organization", "Runs provider operations for one several or all facilities in an organization.", "Organization wide or an explicit set of assigned facilities", "Manage provider operations and assigned clinicians within scope; manage schedules services or prices when granted by the provider role; work across all facilities only when organization wide.", "Act at an unassigned sibling facility; grant platform authority; independently approve a price they authored; bypass professional eligibility or affiliation rules.", "Required at launch.", "Receives authority from the Organization Owner and coordinates provider staff clinicians and clinic operations.", "Test both organization wide and facility scoped variants. Confirm a facility scoped manager is denied at siblings and organization defaults.")
    add_role(doc, "Consultant", "Provider organization clinical role", "Provides consultant level clinical services in the organization and facilities where the assignment applies.", "Assigned facilities organization scope when explicitly granted and self or managed relationships", "Deliver consultant services; manage their own professional workspace schedules and eligible services; supervise Associate Doctors through an active relationship when authorized.", "Consult without a Consultant declaration and Consultant level credential verification in that organization; act at a facility without active affiliation; approve their own credentials.", "Required no later than first executable clinical capability and recommended at launch.", "Receives an accepted membership offer and independent credential decision before clinical authority becomes usable.", "Verify declared level organization credential level active facility affiliation and assignment scope are all required.")
    add_role(doc, "Associate Doctor", "Provider organization clinical role", "Provides clinical services under required supervision within the local engagement.", "Assigned facilities and self or supervised relationships", "Work as an Associate Doctor at assigned active facilities; maintain their own provider workspace; receive supervision from an eligible Consultant in the same organization.", "Work without an active supervising Consultant; act as a Consultant without local Consultant verification; act at another facility or organization without the matching assignment and affiliation.", "Required no later than first executable clinical capability and recommended at launch.", "Works under an active Consultant supervision relationship and follows the organization credential decision.", "Verify Associate or Consultant credential level is accepted for Associate engagement and active supervision is mandatory.")
    add_role(doc, "Consultant Assistant", "Provider organization support role", "Supports selected clinicians and clinic operations without becoming a clinician.", "Assigned facilities plus explicit assisting relationships where used", "Support the clinicians and facilities explicitly assigned; perform allowed administrative provider tasks within that scope.", "Hold Consultant or Associate Doctor in the same facility; receive clinical authority from the assistant role; act for unassigned clinicians or facilities.", "Required if the account also holds a manager role and otherwise follows provider authentication policy.", "Works for selected clinicians and escalates clinical decisions to the responsible clinician.", "Verify same facility clinical role conflict and denial outside assigned clinicians and facilities.")
    add_heading(doc, "No Branch Manager role", 2)
    add_body(doc, "The agreed model does not create a separate Branch Manager role. A Practice Manager covers one branch, several branches, or the entire organization through scope. This avoids duplicate roles with identical duties and makes facility access explicit.")
    add_picture(doc, diagrams["provider_tree"], "Provider example showing one clinician with different roles and clinic affiliations across three organizations.", 7.0)
    add_caption(doc, "Figure 4  Provider roles are contextual")
    # Patients and non roles
    add_heading(doc, "6 Patients representatives and non business identities", 1)
    add_role(doc, "Patient", "Patient population", "Uses the patient experience for their own identity care requests documents communications and journey steps according to the existing patient policy.", "Self and the patient own care context", "Use the patient portal; maintain permitted profile information; access the patient own authorized care information and actions; retain patient access if a separate provider membership is later accepted.", "Receive provider staff platform administration or internal staff authority from the Patient role.", "Follows patient authentication policy. Provider manager or clinical access requires the stronger rules of that accepted context.", "Interacts with care coordination providers travel and finance through the patient journey.", "Verify provider offer acceptance does not remove Patient access and that provider authority does not activate before consent.")
    add_role(doc, "Patient Representative", "Patient population", "Acts for a patient only through an authorized representation relationship.", "The represented patient and the permissions of that relationship", "Use the patient portal for permitted representative actions linked to the represented patient.", "Act for unrelated patients; receive provider internal staff or platform governance authority from the representative label.", "Follows patient authentication policy and any stronger policy required by a separate context.", "Communicates with the patient care team within the authorized representation.", "Verify every action is bound to an active representation relationship and does not leak another patient information.")
    add_heading(doc, "Items that are not business roles", 2)
    add_table(doc, ["Item", "What it means", "Why it must not be treated as a role"], [
        ("MFA REQUIRED", "An authentication policy classifier that forces a strong sign in", "It never grants business authority"),
        ("Vendor operator", "The installer or recovery operator used during controlled setup or recovery", "It is not a normal ongoing platform user role and leaves after handover"),
        ("Provider user", "A population label", "Real authority comes from Organization Owner Practice Manager Consultant Associate Doctor or Consultant Assistant assignments"),
        ("Internal staff", "A population label", "Real authority comes from the selected internal staff profile and its scope"),
    ], [1.35, 2.5, 3.25], 9.0)
    add_heading(doc, "Items not in the launch catalogue", 2)
    add_bullets(doc, [
        "Support Specialist and Support Manager are deferred.",
        "Credentialing Manager is not a separate role.",
        "Journey Specialist roles are not included.",
        "Platform Administrator Access Governance Manager and Support Agent are retired concepts.",
        "Legacy staff realm roles are not a source of production business authority.",
    ])
    # Scope and compatibility
    add_heading(doc, "7 Scopes role combinations and professional eligibility", 1)
    add_heading(doc, "Role and scope work together", 2)
    add_body(doc, "A role without the correct scope cannot reach the resource. The platform resolves the organization and facility from stored data rather than trusting a facility identifier supplied by the browser.")
    add_picture(doc, diagrams["scope_ladder"], "Access scope ladder from platform to assigned organizations organization assigned facilities and relationship based scopes.", 7.0)
    add_caption(doc, "Figure 5  The role says what and the scope says where")
    add_table(doc, ["Scope", "Plain meaning", "Typical holders"], [
        ("PLATFORM", "The named capability applies across RehletShifaa", "System Administrator and selected internal roles"),
        ("ASSIGNED ORGANIZATIONS", "Only the provider organizations assigned to the internal staff member", "Provider Operations Credentialing and other central coverage"),
        ("ORGANIZATION", "The provider organization and all current and future facilities", "Organization Owner and organization wide Practice Manager"),
        ("ASSIGNED FACILITIES", "Only the listed clinics or branches inside one organization", "Facility scoped Practice Manager clinicians assistants and central staff"),
        ("MANAGED CLINICIANS", "Only clinicians linked through an active management relationship", "Practice Manager or provider support roles"),
        ("SELF", "Only the user own profile workspace or professional records", "Consultants Associate Doctors and assistants"),
        ("ASSIGNED CASES", "Only casework assigned to the staff member or team", "Coordination travel and finance roles"),
    ], [1.45, 3.25, 2.4], 9.0)
    add_heading(doc, "Internal staff combinations", 2)
    add_table(doc, ["Combination rule", "Result"], [
        ("One primary job", "Required for normal internal staff. Administration only System Administrators may have no primary job."),
        ("Supplemental responsibilities", "Credentialing Specialist Patient Identity Reviewer Care Journey Manager Care Journey Approver Compliance Auditor and System Administrator may be supplemental when compatible."),
        ("Credentialing plus Provider Operations", "Refused because the person who invites or manages clinicians cannot be their independent credential decision maker."),
        ("Care Journey Manager plus Care Journey Approver", "Refused because the author cannot approve the same control family."),
        ("Compliance Auditor plus System Administrator", "Refused because the auditor cannot audit their own administration."),
    ], [2.15, 4.95], 9.2)
    add_heading(doc, "Provider role combinations", 2)
    add_table(doc, ["Roles held together", "Allowed result and control"], [
        ("Organization Owner and Practice Manager", "Allowed."),
        ("Owner or Practice Manager and Consultant", "Allowed only when clinical eligibility is satisfied. No self credential or self approval bypass."),
        ("Owner or Practice Manager and Associate Doctor", "Allowed only when clinical eligibility and supervision are satisfied."),
        ("Consultant and Associate Doctor", "Allowed only at different facilities when the person is Consultant qualified and the Associate engagement has active supervision."),
        ("Consultant Assistant and Consultant", "Refused at the same facility."),
        ("Consultant Assistant and Associate Doctor", "Refused at the same facility."),
        ("Any provider role and RehletShifaa internal staff", "Refused. Internal staff are never provider members under this model."),
    ], [2.35, 4.75], 9.1)
    add_heading(doc, "Four facts required for a clinical role", 2)
    add_numbered(doc, [
        "The person declares a global professional level such as Consultant or Associate Doctor.",
        "Each provider organization independently verifies the professional level for that organization.",
        "The organization grants a local Consultant or Associate Doctor engagement role.",
        "The person has an active affiliation with every facility named by the assignment.",
    ])
    add_body(doc, "A local role cannot upgrade a person declared or verified professional level. A Consultant role requires a Consultant declaration and Consultant level verification in that organization. An Associate Doctor role accepts Associate or Consultant level verification but also requires active supervision by an eligible Consultant in the same organization.")
    # Lifecycle
    add_heading(doc, "8 Invitations activation suspension and removal", 1)
    add_heading(doc, "Provider membership offers", 2)
    add_body(doc, "Typing an email does not silently attach a person to an organization. The organization sends an offer. The invitee sees the organization facilities proposed roles and dates and then accepts or declines.")
    add_picture(doc, diagrams["offer_flow"], "Five step provider offer flow from invitation through identity resolution review acceptance and activation.", 7.0)
    add_caption(doc, "Figure 6  Provider access starts only after consent")
    add_table(doc, ["Offer state", "Meaning"], [
        ("Awaiting identity", "The platform is safely resolving or creating one identity for the email."),
        ("Pending", "The person may review and accept or decline. Nothing is active yet."),
        ("Accepted", "Membership facility affiliations and compatible role assignments activate together."),
        ("Declined", "This offer ends. Other organizations are untouched."),
        ("Expired", "The offer expires after the configured period. The agreed default is 14 days."),
        ("Cancelled", "The inviter cancels this offer before acceptance."),
        ("Review required", "An identity conflict incompatible role or internal staff collision requires governance review."),
    ], [1.6, 5.5], 9.2)
    add_heading(doc, "Internal staff activation", 2)
    add_numbered(doc, [
        "A System Administrator creates the invitation with one primary job compatible supplementals and operational setup.",
        "The invitee verifies email sets a password enrolls strong authentication and signs in.",
        "The first successful strong authenticated request activates the staff lifecycle once.",
        "Assignments remain unusable while the staff record is still invited.",
    ])
    add_heading(doc, "Local and global lifecycle", 2)
    add_picture(doc, diagrams["lifecycle"], "Comparison of facility affiliation end organization membership end facility suspension and global identity disable.", 7.0)
    add_caption(doc, "Figure 7  Local actions do not cascade globally")
    add_table(doc, ["Action", "What ends", "What remains"], [
        ("End one facility affiliation", "That facility access and any assignment left with no facility", "Other facilities organizations memberships and central coverage"),
        ("Revoke one provider membership", "Provider roles affiliations and relationships in that organization", "Other organizations the global identity and central coverage"),
        ("End central coverage", "The internal assignment for that organization or facility", "Provider memberships and affiliations"),
        ("Suspend one facility", "Facility scoped actions at that site", "Organization and sibling facilities"),
        ("Suspend one organization", "Its facilities become unavailable", "Other organizations"),
        ("Disable global identity", "All memberships become inert", "History remains for audit"),
    ], [2.0, 2.65, 2.45], 8.9)
    add_heading(doc, "Internal staff offboarding", 2)
    add_body(doc, "Offboarding first removes the staff member from new work and identifies blockers such as owned cases open tasks active assignments direct reports or last administrator status. Authorized leads transfer the work. Final offboarding revokes assignments and central memberships, disables sign in, revokes sessions, and keeps history. Urgent security cases may disable sign in immediately while the handover is completed.")
    # Operational data
    add_heading(doc, "9 Services prices schedules cases and routing", 1)
    add_heading(doc, "Service and price selection", 2)
    add_body(doc, "The organization owns the default service catalogue. A facility must explicitly offer a service before it can be priced scheduled or booked there. The platform then chooses the most specific active price.")
    add_picture(doc, diagrams["pricing"], "Five level price precedence from clinician at facility to facility clinician organization default and catalogue fallback.", 7.0)
    add_caption(doc, "Figure 8  Price precedence from most specific to fallback")
    add_heading(doc, "Schedules and virtual care", 2)
    add_bullets(doc, [
        "Every availability slot and exception names a facility.",
        "Virtual care uses a Virtual Care facility rather than an empty facility value.",
        "In person slots cannot overlap across facilities.",
        "In person and virtual slots cannot overlap.",
        "Concurrent virtual slots are denied by default and require an explicit facility setting to allow them.",
        "A clinician is never duplicated to represent another schedule price or clinic.",
    ])
    add_page_break(doc)
    add_heading(doc, "Cases appointments and routing", 2)
    add_table(doc, ["Decision point", "Required context"], [
        ("A provider Consultant is selected", "The case must store the provider organization."),
        ("An in person appointment is made", "The case must store the facility."),
        ("Travel is finalized", "The facility must be known for location specific travel."),
        ("A location specific service is delivered", "The facility must be known and active."),
        ("Care is virtual", "The delivery mode is Virtual and the organization Virtual Care facility is used."),
        ("A clinician is assigned", "The clinician must be active and eligible in the organization and affiliated with the chosen facility."),
        ("Routing selects a destination", "Routing is organization level at launch and facility is an eligibility filter."),
    ], [2.25, 4.85], 9.1)
    # Tester handbook
    add_heading(doc, "10 Tester handbook", 1)
    add_body(doc, "A role test is incomplete if it checks only a successful action. Every important permission needs a positive test in the correct context and negative tests for the wrong organization facility role lifecycle authentication strength and professional eligibility.")
    add_picture(doc, diagrams["test_map"], "Tester coverage map showing identity MFA membership facility compatibility and isolation around every role and scope decision.", 7.0)
    add_caption(doc, "Figure 9  Every access decision has several independent conditions")
    add_heading(doc, "Minimum test personas", 2)
    add_table(doc, ["Persona", "Required setup", "Primary purpose"], [
        ("Platform Account Owner", "Active ownership strong sign in", "Approve administrator changes and prove no business access"),
        ("System Administrator A", "Active staff and administrator assignment", "Create staff and request privileged changes"),
        ("System Administrator B", "Separate active administrator", "Approve changes and prove maker checker"),
        ("Care Coordinator", "Assigned case and organization", "Positive and negative case access"),
        ("Provider Operations Specialist", "Coverage for one organization and one facility", "Provider setup boundary"),
        ("Credentialing Specialist", "Independent coverage for the same organization", "Credential separation"),
        ("Organization Owner", "Organization wide provider membership", "All facility inheritance and no platform access"),
        ("Facility Practice Manager", "Assignment to one of two sibling facilities", "Cross facility denial"),
        ("Consultant", "Declared and verified Consultant active affiliations", "Clinical eligibility"),
        ("Associate Doctor", "Verified level and active supervisor", "Supervision requirement"),
        ("Consultant Assistant", "Assigned facility and clinician", "Relationship and same facility conflict"),
        ("Patient", "Patient account with own case", "Self only access"),
        ("Patient Representative", "One active patient relationship", "Relationship bound access"),
    ], [1.7, 3.15, 2.25], 8.6)

    test_groups = [
        ("Identity and invitation tests", [
            ("ID 01", "Two organizations invite the same email at the same time", "One identity and one practitioner profile are created or reused. Two independent pending offers exist."),
            ("ID 02", "Invite an existing provider identity", "A pending offer is created. No membership role or affiliation becomes active before acceptance."),
            ("ID 03", "Invite an internal staff email from a provider", "No provider offer activates. The case moves to governance review and is refused by default."),
            ("ID 04", "Invite a patient only identity", "A normal offer is created. On acceptance the practitioner profile is created when needed and Patient access remains."),
            ("ID 05", "Accept the same offer twice", "The result is idempotent. The second request does not duplicate memberships affiliations roles or profiles."),
            ("ID 06", "Decline or expire one offer", "Only that offer ends. Other pending offers and active memberships remain."),
        ]),
        ("Organization and facility tests", [
            ("SC 01", "Use an Organization Owner at a newly created facility", "The owner is allowed because organization scope includes current and future facilities."),
            ("SC 02", "Use a facility Practice Manager at a sibling facility", "Access is denied."),
            ("SC 03", "Use a facility Practice Manager on organization defaults", "Access is denied because organization level resources require organization scope."),
            ("SC 04", "Suspend one facility", "Both provider and central facility scoped actions deny at that site. Sibling facilities remain available."),
            ("SC 05", "End one clinician affiliation", "That clinic is removed from facility assignments. Other clinics and organizations remain active."),
            ("SC 06", "Submit a facility identifier that conflicts with the stored resource", "The server uses the stored facility and denies the mismatched context."),
        ]),
        ("Role and professional eligibility tests", [
            ("RL 01", "Grant Consultant to a declared Associate Doctor", "The grant is refused for insufficient professional level."),
            ("RL 02", "Grant Consultant before Consultant verification in that organization", "The grant is refused even if another organization has verified the person."),
            ("RL 03", "Grant Associate Doctor without an active supervisor", "The grant is refused with supervision required."),
            ("RL 04", "Give Consultant and Associate Doctor roles at different facilities", "Allowed only for a Consultant qualified person with valid organization eligibility and supervision for the Associate facility."),
            ("RL 05", "Give Consultant Assistant and Consultant at the same facility", "The combination is refused."),
            ("RL 06", "Revoke one role from a multi role person", "Only the named assignment ends. Other compatible roles remain."),
        ]),
        ("Separation and administration tests", [
            ("AD 01", "System Administrator opens an unrelated clinical document", "Access is denied."),
            ("AD 02", "Compliance Auditor opens a clinical case", "Access is denied. Audit authority is not clinical authority."),
            ("AD 03", "System Administrator grants a role to themselves", "The request is refused."),
            ("AD 04", "Only active administrator resigns through normal flow", "The request is blocked until a replacement is active."),
            ("AD 05", "Provider Operations inviter decides that clinician credentials", "The decision is refused and requires an independent reviewer."),
            ("AD 06", "Care Journey Manager also receives Care Journey Approver", "The combination is refused."),
            ("AD 07", "Compliance Auditor also receives System Administrator", "The combination is refused."),
            ("AD 08", "Practice Manager approves a price version they authored", "The approval is refused."),
        ]),
        ("Authentication and lifecycle tests", [
            ("AU 01", "Owner or administrator uses password only", "The request requires strong authentication."),
            ("AU 02", "A manager accepts an offer without strong authentication", "The platform requests step up before acceptance."),
            ("AU 03", "Invited staff signs in without the required strong authentication", "The staff record does not activate and no authority is usable."),
            ("AU 04", "Two first requests arrive for an invited staff member", "Exactly one activation event is recorded."),
            ("AU 05", "One provider manager role is removed while another qualifying role remains", "Strong authentication remains required."),
            ("AU 06", "A local provider membership is revoked", "The global sign in remains enabled and other memberships continue."),
        ]),
        ("Services prices and schedules tests", [
            ("OP 01", "Request a price with every override level present", "The clinician at facility price wins."),
            ("OP 02", "Remove the clinician at facility price", "The active facility price becomes effective."),
            ("OP 03", "Price or schedule a service not offered by the facility", "The action is denied."),
            ("OP 04", "Create overlapping in person slots at two facilities", "The second slot is denied."),
            ("OP 05", "Create overlapping in person and virtual slots", "The second slot is denied."),
            ("OP 06", "Create an in person appointment without a facility", "The action is denied until an eligible active facility is selected."),
        ]),
    ]
    for heading, rows in test_groups:
        add_heading(doc, heading, 2)
        add_table(doc, ["Test", "Action", "Expected result"], rows, [0.8, 3.0, 3.3], 8.6, BLUE)

    add_heading(doc, "Evidence to keep for every test", 2)
    add_bullets(doc, [
        "The signed in subject and authentication strength.",
        "The organization facility role and scope used by the decision.",
        "Membership affiliation assignment and eligibility status at the time of the request.",
        "The response and the explainable reason for allow or deny.",
        "The audit event with actor subject organization facility previous and new state reason and correlation identifiers.",
        "Proof that unrelated organizations facilities roles and identities did not change.",
    ])
    # Worked example
    add_heading(doc, "11 Worked example", 1)
    add_heading(doc, "Meet Dr Sara", 2)
    add_body(doc, "Dr Sara Haddad has one sign in identity and one practitioner profile. Her global declared professional level is Consultant. Each provider organization still makes its own credential decision and grants its own local role.")
    add_picture(doc, diagrams["example"], "Worked example showing Dr Sara as Owner and Consultant in Al Noor Practice Manager in Gulf Heart and Associate Doctor in Crescent Medical.", 7.0)
    add_caption(doc, "Figure 10  One person with different roles in different contexts")
    add_heading(doc, "Dr Sara access records", 2)
    add_table(doc, ["Organization", "Facilities", "Roles", "Why access works"], [
        ("Al Noor Healthcare Group", "Dubai Clinic and Sharjah Clinic", "Organization Owner across the organization and Consultant at the two clinics", "Active membership active affiliations Consultant declaration and Al Noor Consultant verification"),
        ("Gulf Heart Center", "Gulf Heart Main", "Practice Manager at one assigned facility", "Active membership active affiliation and facility scoped manager assignment"),
        ("Crescent Medical", "Crescent Rehab", "Associate Doctor", "Active membership and affiliation credential level accepted for Associate engagement plus supervision by Dr Omar"),
    ], [1.45, 1.55, 2.05, 2.05], 8.5)
    add_heading(doc, "What Dr Sara may and may not do", 2)
    add_table(doc, ["Question", "Answer", "Reason"], [
        ("Can she manage Al Noor Sharjah as owner", "Yes", "Organization Owner reaches all Al Noor facilities."),
        ("Can she consult at Al Noor Abu Dhabi if it is newly created", "No until assigned and affiliated", "Owner scope reaches it for management but the Consultant role names only Dubai and Sharjah."),
        ("Can she manage Gulf Heart West", "No", "Her Practice Manager assignment names only Gulf Heart Main."),
        ("Can she work as a Consultant at Crescent Rehab", "No", "Her local Crescent role is Associate Doctor. A local role does not upgrade itself."),
        ("Can she approve her own credentials because she is an owner", "No", "Self review is always prohibited."),
        ("Can she grant a RehletShifaa System Administrator role", "No", "Provider authority never reaches platform governance."),
    ], [2.5, 1.35, 3.25], 8.8)
    add_heading(doc, "Change scenarios", 2)
    add_numbered(doc, [
        "If Gulf Heart removes the Practice Manager role, only that assignment ends. Al Noor and Crescent access remain.",
        "If Al Noor ends the Sharjah affiliation, Dr Sara retains Al Noor ownership and Dubai Consultant access. Sharjah Consultant access ends.",
        "If Crescent ends the supervision relationship, Associate Doctor work becomes unusable until valid supervision exists. Her other organizations remain unchanged.",
        "If Gulf Heart suspends Main Clinic, actions at Main deny for all scoped users. Al Noor and Crescent remain available.",
        "If the platform disables Dr Sara global identity for a verified compromise, every membership becomes inert until the global action is resolved.",
    ])
    add_heading(doc, "Example test script", 2)
    add_table(doc, ["Step", "Action", "Expected result"], [
        ("1", "Sign in as Dr Sara with strong authentication", "All three accepted organization contexts appear without duplicate identities."),
        ("2", "Select Al Noor and Dubai Clinic", "Owner and Consultant actions allowed according to their separate permissions."),
        ("3", "Switch to Al Noor and Sharjah Clinic", "Same identity works. Consultant access is allowed through the second affiliation."),
        ("4", "Switch to Gulf Heart Main", "Practice Manager actions are allowed. Clinical Consultant actions are not granted by this role."),
        ("5", "Attempt Gulf Heart West", "Access is denied because the manager scope does not include it."),
        ("6", "Switch to Crescent Rehab", "Associate Doctor actions are allowed only while supervision and eligibility remain active."),
        ("7", "Remove the Gulf Heart manager assignment", "Only Gulf Heart management access ends. Recheck Al Noor and Crescent successfully."),
    ], [0.65, 3.05, 3.4], 8.7)
    # Quick reference
    add_heading(doc, "12 Quick reference and glossary", 1)
    add_heading(doc, "Role catalogue at a glance", 2)
    add_table(doc, ["Population", "Roles"], [
        ("Platform governance", "Platform Account Owner and System Administrator"),
        ("RehletShifaa internal staff", "Care Coordination Manager Care Coordinator Travel and Logistics Manager Travel and Logistics Specialist Commercial and Finance Manager Finance Officer Provider Operations Manager Provider Operations Specialist Credentialing Specialist Patient Identity Reviewer Care Journey Manager Care Journey Approver Compliance Auditor"),
        ("Provider organization", "Organization Owner Practice Manager Consultant Associate Doctor Consultant Assistant"),
        ("Patients", "Patient and Patient Representative"),
    ], [1.8, 5.3], 9.0)
    add_heading(doc, "Naming distinctions", 2)
    add_table(doc, ["Term", "Meaning"], [
        ("Platform Account Owner", "Owns the RehletShifaa platform account governance relationship."),
        ("Organization Owner", "Owns one provider organization tenant. This role has no platform governance authority."),
        ("Provider Organization", "The legal or contracting provider tenant."),
        ("Provider Facility", "A clinic branch hospital center rehabilitation site or virtual care site inside one organization."),
        ("Membership", "The person relationship with one organization and its local lifecycle."),
        ("Facility affiliation", "Where a provider member works. It does not grant authority by itself."),
        ("Role assignment", "What the person may do in the stated context."),
        ("Scope", "Where the role applies such as one organization or selected facilities."),
        ("Central coverage", "A RehletShifaa internal assignment to serve an organization or facility without becoming provider staff."),
        ("Professional declaration", "The practitioner global statement of professional level."),
        ("Organization credential level", "The professional level independently verified by one provider organization."),
        ("Local engagement role", "The Consultant or Associate Doctor work role granted in an organization or facility."),
        ("Strong authentication", "A sign in that includes the required second factor and recorded authentication level."),
    ], [2.0, 5.1], 9.1)
    add_heading(doc, "Decision checklist", 2)
    add_body(doc, "Before allowing any role protected action the platform should be able to answer every applicable question below with Yes.")
    add_numbered(doc, [
        "Is the global identity active",
        "Is the person lifecycle active for this population",
        "Is the membership active in the correct organization",
        "Is the organization active",
        "Is the facility active when the resource is facility scoped",
        "Is the facility affiliation active for a provider facility assignment",
        "Is the role assignment active and does its scope cover this resource",
        "Is strong authentication present when required",
        "Are professional credentials and supervision valid for a clinical action",
        "Are separation of duty and self approval rules satisfied",
    ])
    add_heading(doc, "Final rule", 2)
    add_body(doc, "A person can have several legitimate relationships without receiving broad or accidental access. RehletShifaa keeps one identity, records every organization and clinic relationship separately, evaluates the role in its exact context, and changes only the relationship named by an authorized action.")
    add_body(doc, "Source basis  Customer Governance Target Architecture Reviewed revision 3 and decisions D1 through D35. This guide presents the target behavior in plain language and omits internal implementation detail that owners and testers do not need for daily use.", italic=True)

    # Document properties
    props = doc.core_properties
    props.title = "RehletShifaa Users Roles and Access Guide"
    props.subject = "Platform and provider organization user roles scopes lifecycle and tester guidance"
    props.author = "RehletShifaa"
    props.keywords = "RehletShifaa roles users provider organizations clinics access testing"
    props.comments = "Target operating model"
    doc.save(DOCX)
    return DOCX


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    diagrams = {
        "populations": diagram_populations(),
        "governance": diagram_governance(),
        "provider_tree": diagram_provider_tree(),
        "scope_ladder": diagram_scope_ladder(),
        "offer_flow": diagram_offer_flow(),
        "lifecycle": diagram_lifecycle(),
        "pricing": diagram_pricing(),
        "example": diagram_example(),
        "test_map": diagram_test_map(),
    }
    path = build_doc(diagrams)
    print(path)


if __name__ == "__main__":
    main()
