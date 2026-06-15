from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT = "French_Learning_Website_Plan.pdf"


def draw_page(canvas, doc):
    canvas.saveState()
    width, height = LETTER
    canvas.setFillColor(colors.HexColor("#F8F5EF"))
    canvas.rect(0, 0, width, height, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor("#1F3A5F"))
    canvas.rect(0, height - 0.18 * inch, width, 0.18 * inch, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor("#B33A3A"))
    canvas.rect(0, height - 0.24 * inch, width, 0.06 * inch, stroke=0, fill=1)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawRightString(width - 0.7 * inch, 0.45 * inch, f"Page {doc.page}")
    canvas.restoreState()


def build_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=26,
            leading=31,
            textColor=colors.HexColor("#1F3A5F"),
            alignment=TA_CENTER,
            spaceAfter=10,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=11,
            leading=16,
            textColor=colors.HexColor("#4B5563"),
            alignment=TA_CENTER,
            spaceAfter=22,
        ),
        "h1": ParagraphStyle(
            "Heading1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#1F3A5F"),
            spaceBefore=12,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "Heading2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#B33A3A"),
            spaceBefore=8,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=7,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            leftIndent=14,
            firstLineIndent=-8,
            bulletIndent=4,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=5,
        ),
        "callout": ParagraphStyle(
            "Callout",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#1F3A5F"),
            alignment=TA_LEFT,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#4B5563"),
        ),
    }


def p(text, style):
    return Paragraph(text, style)


def bullet(text, styles):
    return Paragraph(text, styles["bullet"], bulletText="-")


def section_card(title, body, styles):
    data = [[p(title, styles["callout"])], [p(body, styles["body"])]]
    table = Table(data, colWidths=[6.55 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFFFF")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def main():
    styles = build_styles()
    doc = BaseDocTemplate(
        OUTPUT,
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.65 * inch,
    )
    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        id="normal",
        showBoundary=0,
    )
    doc.addPageTemplates([PageTemplate(id="plan", frames=[frame], onPage=draw_page)])

    story = []
    story.append(p("French Learning Website Plan", styles["title"]))
    story.append(
        p(
            "A practical roadmap for replacing a long Google Doc with a searchable, reviewable personal learning app.",
            styles["subtitle"],
        )
    )

    story.append(
        section_card(
            "Recommended stack",
            "<b>React + Vite + Tailwind CSS + lucide-react + localStorage.</b> Start simple, validate the learning workflow, then move to Supabase when cloud sync and accounts matter.",
            styles,
        )
    )
    story.append(Spacer(1, 12))

    story.append(p("Why This Stack", styles["h1"]))
    for item in [
        "<b>React + Vite:</b> fast setup, simple structure, and great for interactive study tools.",
        "<b>Tailwind CSS:</b> quick to style consistently without maintaining a large CSS system.",
        "<b>lucide-react:</b> clean icons for search, edit, review, audio, tags, and navigation.",
        "<b>localStorage first:</b> no backend needed while testing the structure and daily workflow.",
        "<b>Supabase later:</b> add Postgres, auth, sync, backups, and optional audio/file storage when the app is worth growing.",
    ]:
        story.append(bullet(item, styles))

    story.append(p("Core Product Shape", styles["h1"]))
    story.append(
        p(
            "The website should organize everything into structured learning objects instead of one long stream of notes. Each item can be searched, tagged, edited, and reviewed.",
            styles["body"],
        )
    )

    feature_rows = [
        ["Section", "Purpose"],
        ["Today", "Daily review queue, weak items, and one focused learning session."],
        ["Vocabulary", "Words with meaning, gender, part of speech, example sentence, pronunciation note, tags, and confidence."],
        ["Phrases", "Short practical expressions grouped by situation or context."],
        ["Grammar", "One concept per card with explanation, examples, and common mistakes."],
        ["Pronunciation", "Tricky sounds, pronunciation guides, example words, and optional audio notes."],
        ["Review", "Flashcard mode with 'I know this' and 'Needs practice' outcomes."],
        ["Search", "Find any word, phrase, grammar note, or pronunciation entry instantly."],
    ]
    table = Table(feature_rows, colWidths=[1.35 * inch, 5.2 * inch], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F3A5F")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#FFFFFF")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(table)

    story.append(PageBreak())
    story.append(p("Phased Build Plan", styles["h1"]))

    phases = [
        (
            "Phase 1: Personal Learning Dashboard",
            "Build the app shell: sidebar navigation, top search, main content area, add/edit panel, tags, filters, and sample data.",
        ),
        (
            "Phase 2: Structured Entry System",
            "Create entry forms for vocabulary, phrases, grammar, and pronunciation. Save entries locally first.",
        ),
        (
            "Phase 3: Review Mode",
            "Turn saved notes into flashcards. Add confidence states like 'I know this' and 'Needs practice'.",
        ),
        (
            "Phase 4: Import Existing Notes",
            "Move content from the current Google Doc or PDF into structured entries. Start manual, then consider CSV or AI-assisted extraction.",
        ),
        (
            "Phase 5: Cloud Sync",
            "Move persistence from localStorage to Supabase when you want accounts, sync across devices, backups, and audio/file storage.",
        ),
    ]

    for title, body in phases:
        story.append(p(title, styles["h2"]))
        story.append(p(body, styles["body"]))

    story.append(Spacer(1, 6))
    story.append(
        section_card(
            "First milestone",
            "A working French learning dashboard where you can add, search, tag, edit, and review vocabulary, phrases, grammar notes, and pronunciation notes.",
            styles,
        )
    )

    story.append(Spacer(1, 14))
    story.append(p("Initial Data Model", styles["h1"]))
    for item in [
        "<b>Vocabulary:</b> French word, English meaning, gender, part of speech, example sentence, pronunciation note, tags, difficulty, confidence.",
        "<b>Phrase:</b> French phrase, English meaning, context, notes, tags.",
        "<b>Grammar:</b> concept title, explanation, examples, common mistakes, tags.",
        "<b>Pronunciation:</b> sound or word, pronunciation guide, example words, notes.",
    ]:
        story.append(bullet(item, styles))

    story.append(p("Design Direction", styles["h1"]))
    story.append(
        p(
            "Use a calm dashboard style: off-white background, deep navy or charcoal text, restrained blue and red accents, compact cards, clear filters, and no marketing-style landing page. The first screen should be the usable learning workspace.",
            styles["body"],
        )
    )
    story.append(
        p(
            "Suggested opening screen: 'Bonjour, John. Ready for 12 minutes of French?' followed by today's lesson, due review items, weak words, and weekly progress.",
            styles["body"],
        )
    )

    story.append(Spacer(1, 12))
    story.append(p("Decision", styles["h1"]))
    story.append(
        p(
            "Start with React + Vite + Tailwind + lucide-react + localStorage. Build the learning workflow first. Add Supabase only after the structure proves useful.",
            styles["body"],
        )
    )

    doc.build(story)


if __name__ == "__main__":
    main()
