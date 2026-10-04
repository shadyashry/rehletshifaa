from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "rehletshifaa-staff-hierarchy-onboarding-and-testing-guide.pdf"
SCREENS = ROOT / "tmp" / "pdfs" / "screens"
BRAND_ICON = ROOT / "frontend" / "public" / "brand" / "icon.png"
OUT.parent.mkdir(parents=True, exist_ok=True)

PAGE_W, PAGE_H = landscape(A4)
TEAL = colors.HexColor("#12665f")
TEAL_DARK = colors.HexColor("#0c3f45")
MINT = colors.HexColor("#73cfc2")
MINT_PALE = colors.HexColor("#eaf7f4")
INK = colors.HexColor("#102f36")
SLATE = colors.HexColor("#50676d")
LINE = colors.HexColor("#cfe0dc")
PAPER = colors.HexColor("#fbfdfc")
CORAL = colors.HexColor("#e66b5b")
AMBER = colors.HexColor("#aa6b20")
AMBER_PALE = colors.HexColor("#fff4df")
GREEN = colors.HexColor("#287a5d")
RED_PALE = colors.HexColor("#fff0ed")

font_regular = Path("C:/Windows/Fonts/segoeui.ttf")
font_semibold = Path("C:/Windows/Fonts/seguisb.ttf")
font_bold = Path("C:/Windows/Fonts/segoeuib.ttf")
pdfmetrics.registerFont(TTFont("RS", str(font_regular)))
pdfmetrics.registerFont(TTFont("RS-Semi", str(font_semibold)))
pdfmetrics.registerFont(TTFont("RS-Bold", str(font_bold)))

styles = {
    "body": ParagraphStyle("body", fontName="RS", fontSize=9.2, leading=13, textColor=INK),
    "small": ParagraphStyle("small", fontName="RS", fontSize=7.8, leading=10.5, textColor=SLATE),
    "caption": ParagraphStyle("caption", fontName="RS", fontSize=7.6, leading=10, textColor=SLATE),
    "table": ParagraphStyle("table", fontName="RS", fontSize=7.3, leading=9.3, textColor=INK),
    "table_head": ParagraphStyle("table_head", fontName="RS-Semi", fontSize=7.3, leading=9.3, textColor=colors.white),
    "callout": ParagraphStyle("callout", fontName="RS-Semi", fontSize=9, leading=12, textColor=TEAL_DARK),
}

c = canvas.Canvas(str(OUT), pagesize=(PAGE_W, PAGE_H), pageCompression=1)
c.setTitle("RehletShifaa Staff Authority, Hierarchy and Onboarding Guide")
c.setAuthor("RehletShifaa Platform Governance and QA")
c.setSubject("Staff roles, hierarchy, onboarding screens, access governance and UAT")
page_no = 0

def para(text, x, y_top, w, style="body"):
    p = Paragraph(text, styles[style])
    _, h = p.wrap(w, PAGE_H)
    p.drawOn(c, x, y_top - h)
    return h

def header(section):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFillColor(TEAL)
    c.rect(0, PAGE_H - 8*mm, PAGE_W, 8*mm, stroke=0, fill=1)
    c.setFont("RS-Semi", 7.5)
    c.setFillColor(colors.white)
    c.drawString(14*mm, PAGE_H - 5.2*mm, "REHLETSHIFAA  /  STAFF OPERATING GUIDE")
    c.drawRightString(PAGE_W - 14*mm, PAGE_H - 5.2*mm, section.upper())

def footer():
    global page_no
    c.setStrokeColor(LINE)
    c.line(14*mm, 10*mm, PAGE_W - 14*mm, 10*mm)
    c.setFont("RS", 7)
    c.setFillColor(SLATE)
    c.drawString(14*mm, 6.5*mm, "Internal product and UAT guide  |  Local development screenshots  |  27 September 2026")
    c.drawRightString(PAGE_W - 14*mm, 6.5*mm, str(page_no))

def new_page(section, title, subtitle=None):
    global page_no
    if page_no:
        c.showPage()
    page_no += 1
    header(section)
    c.setFillColor(INK)
    c.setFont("RS-Bold", 22)
    c.drawString(14*mm, PAGE_H - 22*mm, title)
    if subtitle:
        c.setFont("RS", 9.5)
        c.setFillColor(SLATE)
        c.drawString(14*mm, PAGE_H - 29*mm, subtitle)
    footer()

def box(x, y, w, h, fill=MINT_PALE, stroke=LINE, radius=4*mm):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)

def callout(number, title, text, x, y, w, h, fill=MINT_PALE):
    box(x, y, w, h, fill)
    c.setFillColor(TEAL)
    c.circle(x + 8*mm, y + h - 8*mm, 4.2*mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("RS-Bold", 9)
    c.drawCentredString(x + 8*mm, y + h - 10.6*mm, str(number))
    c.setFillColor(INK)
    c.setFont("RS-Semi", 10)
    c.drawString(x + 15*mm, y + h - 9.5*mm, title)
    para(text, x + 6*mm, y + h - 17*mm, w - 12*mm, "small")

def fit_image(path, x, y, w, h, pad=2*mm):
    box(x, y, w, h, colors.white, LINE, 3*mm)
    img = ImageReader(str(path))
    iw, ih = img.getSize()
    scale = min((w - 2*pad)/iw, (h - 2*pad)/ih)
    dw, dh = iw*scale, ih*scale
    c.drawImage(img, x + (w-dw)/2, y + (h-dh)/2, dw, dh, preserveAspectRatio=True, mask='auto')

def screenshot_page(title, subtitle, screen, steps, note=None, section="Real platform walkthrough"):
    new_page(section, title, subtitle)
    fit_image(SCREENS / screen, 14*mm, 25*mm, 185*mm, 150*mm)
    x = 205*mm
    y = 160*mm
    for i, (head, text) in enumerate(steps, 1):
        callout(i, head, text, x, y - 31*mm, 77*mm, 27*mm)
        y -= 34*mm
    if note:
        box(x, 25*mm, 77*mm, 30*mm, AMBER_PALE, colors.HexColor("#e5c48e"))
        c.setFont("RS-Semi", 8.5)
        c.setFillColor(AMBER)
        c.drawString(x+5*mm, 48*mm, "TESTER NOTE")
        para(note, x+5*mm, 44*mm, 67*mm, "small")

def make_table(data, widths, x, y_top, row_heights=None, header_bg=TEAL):
    cooked = []
    for r, row in enumerate(data):
        cooked.append([Paragraph(str(cell), styles["table_head" if r == 0 else "table"]) for cell in row])
    t = Table(cooked, colWidths=widths, rowHeights=row_heights, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), header_bg),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("GRID", (0,0), (-1,-1), 0.5, LINE),
        ("LEFTPADDING", (0,0), (-1,-1), 5),
        ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, MINT_PALE]),
    ]))
    _, h = t.wrap(sum(widths), PAGE_H)
    t.drawOn(c, x, y_top-h)
    return h

def arrow(x1, y1, x2, y2, color=MINT, width=1.5):
    """Draw one straight, edge-to-edge flow arrow. Callers supply aligned anchors."""
    import math
    if abs(x2-x1) < 0.01 and abs(y2-y1) < 0.01:
        return
    c.setStrokeColor(color)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)
    a = math.atan2(y2-y1, x2-x1)
    l = 2.7*mm
    c.line(x2, y2, x2-l*math.cos(a-0.45), y2-l*math.sin(a-0.45))
    c.line(x2, y2, x2-l*math.cos(a+0.45), y2-l*math.sin(a+0.45))

def node(x, y, w, h, title, sub, fill=MINT_PALE, stroke=TEAL):
    box(x, y, w, h, fill, stroke, 3*mm)
    c.setFillColor(INK)
    c.setFont("RS-Semi", 10)
    c.drawCentredString(x+w/2, y+h-8*mm, title)
    p = Paragraph(sub, ParagraphStyle("node", fontName="RS", fontSize=7.2, leading=9, alignment=TA_CENTER, textColor=SLATE))
    _, ph = p.wrap(w-7*mm, h)
    p.drawOn(c, x+3.5*mm, y+4*mm)

# Cover
page_no = 1
c.setFillColor(TEAL_DARK)
c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
c.setFillColor(TEAL)
c.circle(PAGE_W-20*mm, PAGE_H-16*mm, 55*mm, stroke=0, fill=1)
c.setFillColor(MINT)
c.circle(PAGE_W-6*mm, 16*mm, 43*mm, stroke=0, fill=1)
c.setFillColor(colors.white)
c.roundRect(15*mm, 18*mm, 180*mm, 160*mm, 7*mm, stroke=0, fill=1)
c.drawImage(str(BRAND_ICON), 25*mm, 146*mm, 29*mm, 29*mm, preserveAspectRatio=True, mask='auto')
c.setFont("RS-Bold", 23)
c.setFillColor(colors.HexColor("#29454d"))
c.drawString(58*mm, 160*mm, "Rehlet")
brand_lead_width = c.stringWidth("Rehlet", "RS-Bold", 23)
c.setFillColor(colors.HexColor("#65bdb5"))
c.drawString(58*mm + brand_lead_width, 160*mm, "Shifaa")
c.setFillColor(INK)
c.setFont("RS-Bold", 28)
c.drawString(26*mm, 118*mm, "Staff authority, hierarchy")
c.drawString(26*mm, 105*mm, "and onboarding guide")
c.setFillColor(TEAL)
c.setFont("RS-Semi", 13)
c.drawString(26*mm, 90*mm, "From Platform Account Owner to frontline staff")
para("A business-facing operating manual with real RehletShifaa screens, approval paths, role boundaries, lifecycle controls and UAT scenarios.", 26*mm, 78*mm, 150*mm, "body")
box(26*mm, 35*mm, 150*mm, 20*mm, MINT_PALE, LINE)
c.setFillColor(TEAL_DARK)
c.setFont("RS-Semi", 9)
c.drawString(32*mm, 47*mm, "CURRENT IMPLEMENTATION")
c.setFont("RS", 8.5)
c.drawString(32*mm, 40*mm, "Section 1 A1-A8 complete  |  Practice Manager and emergency recovery excluded")
c.setFillColor(colors.white)
c.setFont("RS-Bold", 14)
c.drawString(210*mm, 155*mm, "REHLETSHIFAA")
c.setFont("RS", 10)
c.drawString(210*mm, 145*mm, "Platform control plane")
c.drawString(210*mm, 138*mm, "Business + tester edition")
c.setFont("RS-Semi", 9)
c.drawString(210*mm, 32*mm, "27 SEPTEMBER 2026")

# Purpose and guardrails
new_page("Orientation", "How to use this guide", "Business meaning first; executable policy remains authoritative.")
callout(1, "For a buyer or operator", "Understand the staffing model, separation of duties, approval chains and which Control Center page completes each action.", 14*mm, 115*mm, 82*mm, 42*mm)
callout(2, "For implementation teams", "Configure the first owner and administrators, then use supported screens and durable identity workflows instead of editing Keycloak roles.", 105*mm, 115*mm, 82*mm, 42*mm)
callout(3, "For QA and UAT", "Follow the positive and negative scenarios at the end. Verify both visible navigation and direct backend denial.", 196*mm, 115*mm, 82*mm, 42*mm)
box(14*mm, 38*mm, 264*mm, 55*mm, colors.white, LINE)
c.setFont("RS-Bold", 14); c.setFillColor(INK); c.drawString(21*mm, 81*mm, "Five facts to remember")
facts = [
    "Keycloak proves identity and authentication strength; the RehletShifaa database decides business authority.",
    "A role never replaces scope: team, case, function and lifecycle relationships are checked on every request.",
    "The Platform Account Owner and System Administrator do not receive clinical or commercial bypasses.",
    "Team Lead is a relationship, not a role; a lead cannot invite staff or grant access.",
    "Screens hide unavailable actions, but testers must also prove copied URLs and API calls are denied.",
]
y = 70*mm
for i, f in enumerate(facts, 1):
    c.setFillColor(TEAL); c.circle(24*mm, y+1.5*mm, 2.7*mm, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont("RS-Bold", 7); c.drawCentredString(24*mm, y-0.8*mm, str(i))
    para(f, 31*mm, y+4*mm, 235*mm, "body"); y -= 9*mm

# Authority model
new_page("Business model", "One platform, three control layers", "This is not one top-down permission hierarchy. Each layer has a different purpose and boundary.")
layers = [
    ("01", "PLATFORM OWNERSHIP", "Platform Account Owner", "A separate governance relationship. The current owner initiates transfer; the incoming owner accepts; an independent System Administrator verifies.", AMBER_PALE, colors.HexColor("#d6a153")),
    ("02", "ACCESS GOVERNANCE", "System Administrators", "Invite ordinary workforce, assign roles, manage lifecycle and access evidence. Administrator appointment or removal uses two different administrators.", MINT_PALE, TEAL),
    ("03", "OPERATIONAL AUTHORITY", "Functions, teams and work", "A functional role opens a workspace. Team, reporting and case relationships limit where the person may act. No role inherits power from another layer.", colors.HexColor("#eef5f7"), colors.HexColor("#91aeb5")),
]
for i, (number, label, title, body, fill, stroke) in enumerate(layers):
    x = 14*mm + i*89*mm
    box(x, 94*mm, 82*mm, 65*mm, fill, stroke, 4*mm)
    c.setFillColor(stroke); c.circle(x+10*mm, 148*mm, 5*mm, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont("RS-Bold", 8); c.drawCentredString(x+10*mm, 146*mm, number)
    c.setFillColor(stroke); c.setFont("RS-Semi", 8); c.drawString(x+19*mm, 148*mm, label)
    c.setFillColor(INK); c.setFont("RS-Bold", 12); c.drawString(x+7*mm, 133*mm, title)
    para(body, x+7*mm, 125*mm, 68*mm, "small")
box(14*mm, 28*mm, 264*mm, 49*mm, colors.white, LINE, 4*mm)
c.setFillColor(INK); c.setFont("RS-Bold", 12); c.drawString(21*mm, 66*mm, "Managed-function onboarding handoff")
flow = [
    ("Business need", "Function manager"),
    ("Access action", "System Administrator"),
    ("Team placement", "Function manager"),
    ("Scoped work", "Lead + assignment"),
]
for i, (title, sub) in enumerate(flow):
    x = 21*mm + i*64*mm
    node(x, 37*mm, 50*mm, 20*mm, title, sub, MINT_PALE if i < 3 else colors.HexColor("#e7f7ed"), LINE)
    if i < len(flow)-1:
        arrow(x+50*mm, 47*mm, x+61*mm, 47*mm)
c.setFillColor(AMBER); c.setFont("RS-Semi", 7.2)
c.drawString(21*mm, 31*mm, "Current screen flow: Consultant Operations and Care Coordination only. Other functions must not infer TEAM_MANAGE authority.")

# Authority flow
new_page("Governance", "Who grants whom", "The person requesting a change is not always the person who decides it.")
data = [
    ["Target action", "Initiator", "Approver / executor", "Key control"],
    ["Establish first owner + administrators", "Controlled deployment bootstrap", "One-time bootstrap only", "No ordinary Control Center screen; no subjects in source"],
    ["Transfer account ownership", "Current owner", "Incoming owner accepts; different administrator verifies", "Three actors; recent phishing-resistant MFA"],
    ["Appoint/remove System Administrator", "Administrator A", "Different Administrator B", "Maker/checker; last-admin protection"],
    ["Invite staff / change ordinary roles", "System Administrator", "Same administrator executes", "Recent auth; no self-change; conflicts checked"],
    ["Disable, restore or offboard staff", "System Administrator", "Same administrator executes", "Immediate authority stop; continuity blockers"],
    ["Request staffing change", "Function manager", "System Administrator executes or rejects", "Request alone grants nothing"],
    ["Teams, leads, reporting lines", "Function manager", "Same manager executes", "Only a function with TEAM_MANAGE; same function"],
    ["Supervise assigned work", "Team lead / direct manager", "No grant authority", "Supervised scope only"],
    ["MFA reset", "Person or Support requests", "Independent System Administrator", "72-hour window; requester/subject cannot approve"],
]
make_table(data, [59*mm, 54*mm, 75*mm, 75*mm], 14*mm, 164*mm)
box(14*mm, 26*mm, 264*mm, 22*mm, MINT_PALE, LINE)
para("Control rule: the owner governs ownership, administrators govern access, function managers govern relationships, and leads supervise scoped work. None of these powers is inherited by position.", 21*mm, 41*mm, 250*mm, "callout")

# Function coverage
new_page("Role catalogue", "Workforce functions and management coverage", "The policy has ten functions and twelve staff roles. Only two functions currently expose TEAM_MANAGE.")
data = [
    ["Function", "Staff role(s)", "TEAM_MANAGE today", "Operational meaning"],
    ["Platform Administration", "System Administrator", "No", "Access governance; reporting lines grant nothing"],
    ["Consultant Operations", "Consultant Operations Manager", "Yes - same role", "Consultant onboarding, catalogue and staffing"],
    ["Credentialing", "Credential Verification Officer", "No", "Independent credential and capability decisions"],
    ["Care Coordination", "Care Coordination Manager; Care Coordinator", "Yes - manager role", "Routing, teams, intake and coordination"],
    ["Operations", "Operations Specialist", "No current manager grant", "Assigned fulfilment work; leads may supervise scoped work"],
    ["Finance", "Finance Officer", "No current manager grant", "Assigned finance work and commercial controls"],
    ["Care Journey", "Journey Manager; Journey Approver", "No", "Independent maker/checker responsibilities, not rank"],
    ["Compliance / Support / Patient Identity", "Auditor; Support Officer; Identity Reviewer", "No", "Independent bounded control functions"],
]
make_table(data, [48*mm, 70*mm, 57*mm, 88*mm], 14*mm, 164*mm)
box(14*mm, 25*mm, 264*mm, 26*mm, AMBER_PALE, colors.HexColor("#e5c48e"))
c.setFont("RS-Semi", 9); c.setFillColor(AMBER); c.drawString(21*mm, 42*mm, "IMPLEMENTATION BOUNDARY")
para("System Administrators can onboard all ordinary roles. Manager-driven Teams and Staffing Requests are currently available only to Consultant Operations and Care Coordination. Define TEAM_MANAGE ownership before relying on those screens for the other functions.", 21*mm, 37*mm, 250*mm, "small")

# Role catalogue 2
new_page("Role catalogue", "Specialist and frontline roles", "Each role opens a bounded workspace and remains subject to case/team scope.")
data = [
    ["Role", "Purpose", "Workspace", "Access path"],
    ["Credential Verification Officer", "Review evidence; decide credentials and capabilities", "Credentialing", "Administrator assigns ordinary role"],
    ["Care Coordinator", "Intake, coordination and assigned/supervised case work", "Coordination", "Administrator assigns; manager places team"],
    ["Operations Specialist", "Assigned travel and fulfilment work", "Operations", "Administrator assigns role"],
    ["Finance Officer", "Assigned finance work, policy, FX and payments", "Finance", "Administrator assigns role"],
    ["Care Journey Manager", "Create and edit journey versions", "Journey Governance", "Administrator assigns role"],
    ["Care Journey Approver", "Independently review and approve versions", "Journey Governance", "Administrator assigns separate role"],
    ["Compliance and Audit Reviewer", "Read-only audit, access, credential and journey review", "Control Center", "Administrator assigns; exclusive role"],
    ["Support Officer", "Bounded account support and MFA-reset requests", "Support", "Administrator assigns; not with System Admin"],
    ["Patient Identity Reviewer", "Review patient and representative identity evidence", "Identity Review", "Administrator assigns role"],
]
make_table(data, [58*mm, 86*mm, 58*mm, 61*mm], 14*mm, 164*mm)

# Home screenshot
screenshot_page("1. Start from the permission-aware Control Center", "Real page: Control Center Home", "01-control-center-home.png", [
    ("Sign in with the correct staff account", "The sidebar is generated from effective database permissions, not token roles."),
    ("Check work requiring attention", "Pending invitations, staffing requests and administrator approvals are summarized here."),
    ("Use the business section", "Workforce handles people and teams; Access & Governance handles privileged controls."),
], "Hidden navigation is not proof of authorization. Copy the URL with an unauthorized user and verify backend denial.")

# People
screenshot_page("2. Review the workforce directory", "Real page: Workforce > People", "02-people.png", [
    ("Actor", "System Administrator changes staff. Compliance/Audit may have read-only visibility."),
    ("Confirm current state", "Review lifecycle, roles, email and last sign-in before acting."),
    ("Choose the lifecycle action", "Invite, change roles, disable, restore or begin offboarding from the person's card."),
], "People is for RehletShifaa internal staff only. Consultants, Practice Managers and patients use separate flows.")

# Invite
screenshot_page("3. Invite an internal staff member", "Real dialog: Invite a person", "03-invite-person.png", [
    ("Enter identity details", "Use the person's work name, work email and invitation language."),
    ("Select compatible roles", "Choose at least one ordinary role. System Administrator is intentionally absent."),
    ("Record the reason and send", "The invitation is durable, expiring and grants no authority until activation with MFA."),
], "Do not submit duplicate test invitations. Verify resend/recovery reuses the same identity and person.")

# Roles
screenshot_page("4. Assign or change ordinary roles", "Real dialog: Change roles", "04-change-roles.png", [
    ("Actor", "System Administrator with recent MFA."),
    ("Compare current and intended work", "Add only roles required for the person's responsibilities."),
    ("Save with a reason", "The backend checks conflicts and updates effective database authority immediately."),
], "Compliance/Audit cannot hold another role. Support cannot also be System Administrator. Admin changes use the separate maker/checker screen.")

# Admin
screenshot_page("5. Govern System Administrators", "Real page: Access & Governance > Administrators", "09-administrators.png", [
    ("Maintain at least two", "Two effective administrators are required for safe maker/checker operations."),
    ("Administrator A requests", "Appointment or removal is proposed with effective dates and a reason."),
    ("Administrator B decides", "A different administrator approves or rejects. The requester cannot decide."),
], "Every privileged decision requires recent phishing-resistant authentication. The last effective administrator cannot be removed.")

# Admin request
screenshot_page("6. Request an administrator appointment", "Real dialog: Request appointment", "10-request-administrator.png", [
    ("Choose an eligible person", "The target must already be active workforce and enrolled in MFA."),
    ("Set effective dates", "Use a non-expiring appointment unless a safe future administrator schedule remains."),
    ("Submit for second approval", "The target is not an administrator until a different administrator approves."),
], "Test self-grant, duplicate decision, expired request and last-admin removal as negative cases.")

# Workforce authority composition
new_page("Workforce authority", "How a staff member actually gains authority", "Four independent facts combine. Missing any required fact means the action is denied.")
authority_steps = [
    ("1", "ACTIVE IDENTITY", "Workforce person is ACTIVE and sign-in is enabled.", "System Administrator"),
    ("2", "FUNCTIONAL ROLE", "An effective database role opens the named workspace.", "System Administrator"),
    ("3", "RELATIONSHIP", "Team, lead and direct-manager facts create supervised scope.", "Function Manager"),
    ("4", "WORK ASSIGNMENT", "Case or task assignment limits access to the resource.", "Business workflow"),
]
for i, (num, title, body, owner) in enumerate(authority_steps):
    x = 14*mm + i*68*mm
    box(x, 119*mm, 59*mm, 43*mm, colors.white if i%2 else MINT_PALE, LINE, 4*mm)
    c.setFillColor(TEAL); c.circle(x+8*mm, 152*mm, 4.5*mm, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont("RS-Bold", 8); c.drawCentredString(x+8*mm, 150*mm, num)
    c.setFillColor(TEAL_DARK); c.setFont("RS-Semi", 8); c.drawString(x+15*mm, 151*mm, title)
    para(body, x+6*mm, 141*mm, 47*mm, "small")
    c.setFillColor(SLATE); c.setFont("RS-Semi", 7); c.drawString(x+6*mm, 124*mm, "Maintained by: " + owner)
    if i < len(authority_steps)-1:
        arrow(x+59*mm, 140*mm, x+66*mm, 140*mm)
box(14*mm, 75*mm, 264*mm, 28*mm, TEAL_DARK, TEAL_DARK, 4*mm)
c.setFillColor(colors.white); c.setFont("RS-Bold", 13); c.drawCentredString(146*mm, 92*mm, "ROLE POLICY  +  SCOPE RELATIONSHIP  +  ACTIVE LIFECYCLE  =  ALLOWED ACTION")
c.setFont("RS", 8); c.drawCentredString(146*mm, 83*mm, "A screen can be visible while a particular case, team or action still remains out of scope.")
box(14*mm, 27*mm, 127*mm, 34*mm, AMBER_PALE, colors.HexColor("#e5c48e"), 4*mm)
c.setFillColor(AMBER); c.setFont("RS-Semi", 9); c.drawString(21*mm, 50*mm, "CURRENT TEAM-MANAGEMENT COVERAGE")
para("Consultant Operations Manager and Care Coordination Manager hold TEAM_MANAGE. Other functions need an explicit policy decision before their team structures can be maintained through this screen flow.", 21*mm, 45*mm, 113*mm, "small")
box(151*mm, 27*mm, 127*mm, 34*mm, RED_PALE, colors.HexColor("#efb5ad"), 4*mm)
c.setFillColor(CORAL); c.setFont("RS-Semi", 9); c.drawString(158*mm, 50*mm, "NO LEAD BYPASS")
para("A lead supervises only current members or direct reports in the same function. Lead status cannot grant roles, alter identities, or bypass case assignment and protected decisions.", 158*mm, 45*mm, 113*mm, "small")

# Teams
screenshot_page("7. Build teams and reporting lines", "Real page: Workforce > Teams", "05-teams.png", [
    ("Actor", "A holder of TEAM_MANAGE for the displayed function. Today: Consultant Operations or Care Coordination Manager."),
    ("Maintain relationships", "Add eligible members, designate leads and record direct managers."),
    ("Protect continuity", "Replace the only lead before removing or offboarding them from a populated team."),
], "Try the same actions with an administrator or a manager from another function; every mutation must be denied.")

# New Team
screenshot_page("8. Create a team inside a managed function", "Real dialog: New team", "06-new-team.png", [
    ("Select a managed function", "The list comes from TEAM_MANAGE. In the current policy only Consultant Operations and Care Coordination appear."),
    ("Name the team", "Use an operationally meaningful name; duplicate names in the same function are rejected."),
    ("State the reason", "The reason is stored in the audit trail before members and leads are added."),
], "Creating a team does not grant a role. Staff must already hold an eligible active role for that function.")

# Staffing
screenshot_page("9. Request a staffing change", "Real page: Workforce > Staffing Requests", "07-staffing-requests.png", [
    ("Manager submits", "Choose new hire, job change, team move or removal for a managed function."),
    ("Administrator executes", "The administrator performs the real invitation, role, team or lifecycle change."),
    ("Close with evidence", "Mark executed with the resulting invitation/change reference, or reject with a reason."),
], "Marking a request executed does not itself grant access. Test that the referenced business change actually exists.")

screenshot_page("10. Capture the business need", "Real dialog: New staffing request", "08-new-staffing-request.png", [
    ("Choose the function", "Only the manager's functions appear."),
    ("Choose the request type", "New hire, job change, team move or removal."),
    ("Describe the outcome", "Include enough detail for the administrator to execute without guessing authority."),
], "The function manager requests; the System Administrator remains accountable for the access mutation.")

# Lifecycle diagram
new_page("Lifecycle", "Staff lifecycle and access effect", "The business state is authoritative. Identity-provider changes follow as durable after-commit operations.")
node(14*mm, 116*mm, 47*mm, 30*mm, "INVITED", "No effective business authority.", MINT_PALE, LINE)
node(77*mm, 116*mm, 47*mm, 30*mm, "ACTIVE", "Roles and valid scope may become effective.", colors.HexColor("#e7f7ed"), LINE)
node(168*mm, 116*mm, 50*mm, 30*mm, "OFFBOARDING", "Authority stops; blockers and handover remain.", RED_PALE, LINE)
node(234*mm, 116*mm, 47*mm, 30*mm, "OFFBOARDED", "Relationships end; history is retained.", colors.HexColor("#eef1f2"), LINE)
node(14*mm, 72*mm, 47*mm, 27*mm, "CANCELLED / EXPIRED", "Invitation closes; re-invite starts a new record.", colors.HexColor("#eef1f2"), LINE)
node(77*mm, 72*mm, 47*mm, 27*mm, "SIGN-IN DISABLED", "Temporary. Database authority stops immediately.", AMBER_PALE, LINE)
arrow(61*mm, 131*mm, 77*mm, 131*mm)
arrow(124*mm, 131*mm, 168*mm, 131*mm)
arrow(218*mm, 131*mm, 234*mm, 131*mm)
arrow(37.5*mm, 116*mm, 37.5*mm, 99*mm)
arrow(96*mm, 116*mm, 96*mm, 99*mm)
arrow(105*mm, 99*mm, 105*mm, 116*mm)
arrow(124*mm, 85.5*mm, 168*mm, 116*mm)
c.setFillColor(SLATE); c.setFont("RS-Semi", 7)
c.drawString(82*mm, 106*mm, "disable")
c.drawString(108*mm, 106*mm, "restore")
callout(1, "Activation", "Invitation authority remains dormant until the invitee completes identity setup, MFA enrolment and activation.", 14*mm, 24*mm, 82*mm, 34*mm)
callout(2, "Temporary disable", "Roles remain recorded. Restore is allowed only from SIGN-IN DISABLED and never reverses offboarding.", 105*mm, 24*mm, 82*mm, 34*mm)
callout(3, "Offboarding", "ACTIVE or SIGN-IN DISABLED may enter offboarding. Complete only after work and relationship blockers are resolved.", 196*mm, 24*mm, 82*mm, 34*mm)

# Reviews
screenshot_page("11. Recertify access and approve MFA resets", "Real page: Access & Governance > Access Reviews", "11-access-reviews.png", [
    ("Start the right campaign", "Privileged access is reviewed more frequently than ordinary workforce access."),
    ("Certify or remove", "Every item needs an explicit decision. Unreviewed access is not silently retained."),
    ("Separate support and approval", "Support requests an MFA reset; an administrator approves or rejects it."),
], "Verify removal actually ends the assignment and that Support cannot approve its own reset request.")

# Audit
screenshot_page("12. Verify the audit trail", "Real page: Access & Governance > Audit", "12-audit.png", [
    ("Filter by business event", "Review invitations, roles, administrators, teams, lifecycle, support and reviews."),
    ("Check evidence", "Each event should identify actor, target, outcome, time and reason."),
    ("Test denied attempts", "Security-sensitive failures should remain explainable without exposing confidential data."),
], "Screenshots use local development data. Never include passwords, OTP seeds, passkey keys or tunnel credentials in evidence.")

# Testing matrix
new_page("UAT", "Minimum positive test journey", "Use separate actors. Never simulate maker/checker with one subject.")
data = [
    ["Sequence", "Actor", "Action", "Expected evidence"],
    ["1", "Deployment bootstrap", "Establish first owner + exactly two initial administrators", "Three distinct identities; one-shot; no ordinary UI"],
    ["2", "Administrator A", "Invite ordinary workforce with compatible role", "Open invitation; no pre-activation access"],
    ["3", "Invitee", "Verify email, set password, enroll MFA", "ACTIVE lifecycle; correct /me workspace"],
    ["4", "Supported function manager", "Create team, add member, lead and manager", "TEAM_MANAGE function only; relationships audited"],
    ["5", "Supported function manager", "Submit staffing request", "SUBMITTED; no authority change yet"],
    ["6", "Administrator A", "Execute referenced access change", "Actual invitation/role/team/lifecycle row"],
    ["7", "Administrator A", "Request new System Administrator", "PENDING second approval"],
    ["8", "Administrator B", "Approve with recent phishing-resistant MFA", "Effective assignment and immutable decision"],
    ["9", "Support then Admin", "Request and approve MFA reset", "Verification checklist, decision, logout"],
    ["10", "Administrator", "Disable, restore, then offboard test staff", "Immediate authority loss; blockers; retained history"],
]
make_table(data, [22*mm, 55*mm, 93*mm, 93*mm], 14*mm, 163*mm)

# Negative tests
new_page("UAT", "Mandatory negative tests", "A hidden button is not enough; call the protected route/API directly.")
tests = [
    ("Self and maker/checker", "Self-grant, self-revoke, own-request approval and duplicate decision are rejected."),
    ("Last administrator", "Removal, disable, offboarding or expiry cannot leave zero effective administrators."),
    ("Role conflicts", "Compliance plus any other role, and Support plus System Administrator, are rejected."),
    ("Cross-function", "A manager cannot create teams, move people or set reporting lines in another function."),
    ("Lead boundaries", "A lead cannot grant roles, change identities or act on unassigned protected work."),
    ("Lifecycle", "Invited, disabled, offboarding and offboarded staff cannot regain access from stale tokens."),
    ("Authentication", "Password-only, stale auth_time, insufficient acr and missing claims fail closed."),
    ("Restore gate", "Workforce requests remain 503 until zero-discrepancy POST_RESTORE reconciliation passes."),
]
for i, (head, text) in enumerate(tests):
    col, row = i%2, i//2
    callout(i+1, head, text, 14*mm + col*134*mm, 137*mm - row*32*mm, 128*mm, 27*mm, colors.white if row%2 else MINT_PALE)

# Role test accounts
new_page("UAT", "Recommended staff test identities", "Use synthetic local accounts and separate subjects for every approval boundary.")
data = [
    ["Identity", "Required setup", "Primary proof"],
    ["Platform Account Owner", "Recent phishing-resistant MFA; distinct incoming owner and verifier", "Three-party transfer"],
    ["Administrator A", "Active workforce; System Administrator; OTP + WebAuthn", "Request privileged change"],
    ["Administrator B", "Different active administrator; OTP + WebAuthn", "Approve/reject privileged change"],
    ["Function Manager", "Consultant Operations or Care Coordination Manager role", "TEAM_MANAGE function only"],
    ["Team Lead", "Base functional role + active lead relationship", "Supervised scope only"],
    ["Ordinary Staff", "Active functional role and team membership", "Own workspace and assignments"],
    ["Compliance Reviewer", "Compliance role only", "Read-only evidence"],
    ["Support Officer", "Support role only; not administrator", "Bounded support + MFA request"],
    ["Credential / Identity Reviewer", "Relevant specialist role + recent MFA", "Decision boundary"],
]
make_table(data, [62*mm, 108*mm, 93*mm], 14*mm, 164*mm)
box(14*mm, 27*mm, 264*mm, 22*mm, AMBER_PALE, colors.HexColor("#e5c48e"))
para("Never store test passwords, OTP seeds, passkey private keys, recovery credentials or tunnel secrets in source code, screenshots or evidence documents.", 21*mm, 42*mm, 250*mm, "callout")

# Current readiness
new_page("Readiness", "Implemented staff controls and current boundaries", "Use the delivered paths where they exist; do not infer missing authority from job titles.")
box(14*mm, 84*mm, 127*mm, 76*mm, colors.HexColor("#e7f7ed"), colors.HexColor("#acd8bd"))
c.setFillColor(GREEN); c.setFont("RS-Bold", 15); c.drawString(21*mm, 147*mm, "IMPLEMENTED STAFF CONTROLS")
complete = ["Database-owned role and permission policy", "People invitation, role and lifecycle screens", "Administrator maker/checker and owner transfer", "Team/staffing flow for two managed functions", "MFA, audit, reviews and restore sign-in gate"]
y=135*mm
for t in complete:
    c.setFillColor(GREEN); c.circle(23*mm, y+1*mm, 2*mm, stroke=0, fill=1)
    c.setFillColor(INK); c.setFont("RS", 8.5); c.drawString(29*mm, y-1.5*mm, t); y-=10*mm
box(151*mm, 84*mm, 127*mm, 76*mm, RED_PALE, colors.HexColor("#efb5ad"))
c.setFillColor(CORAL); c.setFont("RS-Bold", 15); c.drawString(158*mm, 147*mm, "BOUNDARIES / OPEN COVERAGE")
gated = ["No ordinary screen for initial owner/bootstrap", "TEAM_MANAGE exists for only 2 of 10 functions", "External populations belong in separate guides", "OD-02 emergency platform recovery is gated", "OPS-03 full PostgreSQL/Keycloak/MinIO restore is gated"]
y=135*mm
for t in gated:
    c.setFillColor(CORAL); c.circle(160*mm, y+1*mm, 2*mm, stroke=0, fill=1)
    c.setFillColor(INK); c.setFont("RS", 8.5); c.drawString(166*mm, y-1.5*mm, t); y-=10*mm
box(14*mm, 33*mm, 264*mm, 43*mm, MINT_PALE, LINE)
c.setFillColor(TEAL_DARK); c.setFont("RS-Bold", 13); c.drawString(21*mm, 63*mm, "Operational handoff")
para("Use this guide with the live Section 1 implementation status and executable tests. If a screen, this guide and backend authorization disagree, treat the mismatch as a defect and reconcile all three before release.", 21*mm, 56*mm, 250*mm, "body")

# Sources
new_page("Reference", "Source of truth and document control", "Prepared from the current codex/platform-control-plane checkout and live development UI.")
sources = [
    "docs/platform-control-plane/platform-users-and-virtual-clinics-requirements.md",
    "docs/platform-control-plane/section-1-implementation-status.md",
    "docs/platform-control-plane/authority-from-scratch-design.md",
    "backend/src/main/java/com/rehletshifaa/authority/domain/Role.java",
    "backend/src/main/java/com/rehletshifaa/authority/domain/RolePolicy.java",
    "backend/src/main/java/com/rehletshifaa/authority/application/Authority.java",
    "backend/src/main/java/com/rehletshifaa/workforce/application/WorkforceHierarchyService.java",
    "Live UI: https://dev.rehletshifaa.com (local development data only)",
]
y=153*mm
for i, s in enumerate(sources, 1):
    box(18*mm, y-12*mm, 260*mm, 10*mm, colors.white if i%2 else MINT_PALE, LINE, 2*mm)
    c.setFillColor(TEAL); c.setFont("RS-Semi", 8); c.drawString(23*mm, y-8*mm, f"{i:02d}")
    c.setFillColor(INK); c.setFont("RS", 8); c.drawString(34*mm, y-8*mm, s)
    y -= 14*mm
box(18*mm, 14*mm, 260*mm, 22*mm, TEAL_DARK, TEAL_DARK)
c.setFillColor(colors.white); c.setFont("RS-Semi", 9); c.drawString(25*mm, 27*mm, "Document owner: Platform governance and QA")
c.setFont("RS", 8); c.drawString(25*mm, 20*mm, "Update this PDF whenever role policy, staff lifecycle, Control Center navigation or approval flows change.")

c.save()
print(OUT)
