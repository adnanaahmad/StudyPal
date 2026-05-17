import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

# Theme Colors
BG_COLOR = RGBColor(15, 17, 26)       # #0F111A Deep Dark
CARD_COLOR = RGBColor(30, 30, 46)     # #1E1E2E Dark Gray
TEXT_WHITE = RGBColor(255, 255, 255)  # #FFFFFF
TEXT_GRAY = RGBColor(160, 160, 176)   # #A0A0B0
ACCENT_PURPLE = RGBColor(139, 92, 246)# #8B5CF6
ACCENT_BLUE = RGBColor(59, 130, 246)  # #3B82F6
ACCENT_GREEN = RGBColor(16, 185, 129) # #10B981 for metrics

def add_background(slide, prs):
    # Create a full slide rectangle for the background
    left = top = Inches(0)
    width = prs.slide_width
    height = prs.slide_height
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = BG_COLOR
    shape.line.fill.background() # No border

def add_card(slide, left, top, width, height, title, content, title_color=ACCENT_PURPLE, align_center=False):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = CARD_COLOR
    shape.line.fill.background()
    
    # Unified text box to prevent overlapping/clipping and support natural wrapping
    txBox = slide.shapes.add_textbox(left + Inches(0.15), top + Inches(0.05), width - Inches(0.3), height - Inches(0.1))
    tf = txBox.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = Inches(0.05)
    
    # Determine sizing based on card height
    if height < Inches(1.0):
        title_size = Pt(13)
        content_size = Pt(11)
        space_before = Pt(2)
    else:
        title_size = Pt(16)
        content_size = Pt(12)
        space_before = Pt(6)
        
    # Title Paragraph
    p = tf.paragraphs[0]
    p.text = title
    p.font.bold = True
    p.font.size = title_size
    p.font.color.rgb = title_color
    if align_center:
        p.alignment = PP_ALIGN.CENTER
        
    # Content Paragraph
    if content:
        p_c = tf.add_paragraph()
        p_c.text = content
        p_c.font.size = content_size
        p_c.font.color.rgb = TEXT_WHITE
        p_c.space_before = space_before
        if align_center:
            p_c.alignment = PP_ALIGN.CENTER

def add_metric_card(slide, left, top, width, height, metric, description, metric_color=ACCENT_PURPLE):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = CARD_COLOR
    shape.line.fill.background()
    
    # Metric (Huge)
    txBox = slide.shapes.add_textbox(left, top + Inches(0.3), width, Inches(1.5))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.add_paragraph()
    p.text = metric
    p.font.bold = True
    p.font.size = Pt(64)
    p.font.color.rgb = metric_color
    p.alignment = PP_ALIGN.CENTER
    
    # Description
    if description:
        txBox_c = slide.shapes.add_textbox(left + Inches(0.2), top + Inches(1.6), width - Inches(0.4), Inches(1.2))
        tf_c = txBox_c.text_frame
        tf_c.word_wrap = True
        p_c = tf_c.add_paragraph()
        p_c.text = description
        p_c.font.size = Pt(16)
        p_c.font.color.rgb = TEXT_WHITE
        p_c.alignment = PP_ALIGN.CENTER

def add_header(slide, title, subtitle):
    txBox = slide.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(12.33), Inches(1.5))
    tf = txBox.text_frame
    tf.word_wrap = True
    
    p = tf.paragraphs[0]
    p.text = title
    p.font.bold = True
    p.font.size = Pt(36)
    p.font.color.rgb = TEXT_WHITE
    
    if subtitle:
        p2 = tf.add_paragraph()
        p2.text = subtitle
        p2.font.size = Pt(18)
        p2.font.color.rgb = TEXT_GRAY

def build_presentation():
    prs = Presentation()
    # Set to widescreen 16:9
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    
    blank_layout = prs.slide_layouts[6]
    
    # --- Slide 1: Title Slide ---
    s1 = prs.slides.add_slide(blank_layout)
    add_background(s1, prs)
    
    txBox = s1.shapes.add_textbox(Inches(1.5), Inches(2.5), Inches(10.33), Inches(3.0))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "StudyPal"
    p.font.bold = True
    p.font.size = Pt(64)
    p.font.color.rgb = TEXT_WHITE
    p.alignment = PP_ALIGN.CENTER
    
    p2 = tf.add_paragraph()
    p2.text = "The AI-Native Learning Operating System for Neurodivergent Minds."
    p2.font.size = Pt(24)
    p2.font.color.rgb = ACCENT_BLUE
    p2.alignment = PP_ALIGN.CENTER
    
    txBox_footer = s1.shapes.add_textbox(Inches(0.5), Inches(6.5), Inches(12.33), Inches(0.5))
    tf_f = txBox_footer.text_frame
    p_f = tf_f.paragraphs[0]
    p_f.text = "Next.js · FastAPI · PostgreSQL · qwen2.5:7b · gemma4:e2b · nomic-embed-text · duckduckgo · Vocal Bridge"
    p_f.font.size = Pt(14)
    p_f.font.color.rgb = TEXT_GRAY
    p_f.alignment = PP_ALIGN.CENTER

    # --- Slide 2: The Accessibility Gap ---
    s2 = prs.slides.add_slide(blank_layout)
    add_background(s2, prs)
    add_header(s2, "THE ACCESSIBILITY GAP IN MODERN LEARNING", "Traditional education systems create severe barriers for learners with ADHD, dyslexia, and learning differences.")
    
    add_card(s2, Inches(1.0), Inches(2.0), Inches(5.0), Inches(2.0), "1. The Pacing & Overload Trap", "Standard classrooms move too fast, triggering executive dysfunction and cognitive fatigue. Textbooks fail to accommodate visual/auditory processing styles.", ACCENT_PURPLE)
    add_card(s2, Inches(7.33), Inches(2.0), Inches(5.0), Inches(2.0), "2. The Dependency & Financial Barrier", "Accessing specialized help like TAs, remedial classes, or private tutors is highly expensive, time-restricted, and hard to coordinate.", ACCENT_BLUE)
    add_card(s2, Inches(1.0), Inches(4.5), Inches(5.0), Inches(2.0), "3. The Learning Anxiety Loop", "Fear of judgment or admitting confusion in front of peers often stops students from asking repeated questions.", ACCENT_BLUE)
    add_card(s2, Inches(7.33), Inches(4.5), Inches(5.0), Inches(2.0), "4. Lack of Active Engagement", "Passive reading or listening fails to keep learners with ADHD engaged, leading to distraction and loss of interest.", ACCENT_PURPLE)

    # --- Slide 3: Architecture 1 (Conversational Engine) ---
    s3 = prs.slides.add_slide(blank_layout)
    add_background(s3, prs)
    add_header(s3, "ARCHITECTURE: CONVERSATIONAL ENGINE", "A robust orchestrated backend powering the Chat & Tutor Bot.")
    
    add_card(s3, Inches(1.0), Inches(2.0), Inches(11.33), Inches(1.2), "Entry Points (Frontend & API)", "Next.js UI Workspace  |  CLI (Typer)  |  WebSocket (/api/v1/ws)  |  Python SDK", TEXT_WHITE, align_center=True)
    add_card(s3, Inches(4.0), Inches(3.5), Inches(5.33), Inches(1.0), "Unified Orchestrator", "Intelligently routes conversational traffic to standard tools or multi-step capability pipelines.", ACCENT_BLUE, align_center=True)
    add_card(s3, Inches(1.0), Inches(5.0), Inches(5.0), Inches(1.5), "Level 2: Capabilities (The Brain)", "Multi-step agent pipelines taking over conversations.\ne.g., deepsolve (plan -> reason -> write)", ACCENT_PURPLE)
    add_card(s3, Inches(7.33), Inches(5.0), Inches(5.0), Inches(1.5), "Level 1: Tools (The Muscle)", "Lightweight, single-function tools called dynamically by the LLM.\ne.g., rag, web_search, code_execution", ACCENT_PURPLE)

    # --- Slide 4: Architecture 2 (Copilot Workspace) ---
    s4 = prs.slides.add_slide(blank_layout)
    add_background(s4, prs)
    add_header(s4, "ARCHITECTURE: COPILOT WORKSPACE", "Seamlessly integrating AI into UI tools like the Study Planner.")
    
    add_card(s4, Inches(0.5), Inches(2.5), Inches(3.8), Inches(3.0), "1. CopilotKit Provider", "Wraps the Next.js frontend, managing real-time chat state and LLM connectivity (gemma4:e2b / Copilot Model) across all active workspaces.", ACCENT_PURPLE)
    add_card(s4, Inches(4.76), Inches(2.5), Inches(3.8), Inches(3.0), "2. Readable State (useCopilotReadable)", "Instantly exposes the student's active workspace state (e.g., current planner schedule, whiteboard canvas) directly into the AI's conversational context.", ACCENT_BLUE)
    add_card(s4, Inches(9.03), Inches(2.5), Inches(3.8), Inches(3.0), "3. Executable Actions (useCopilotAction)", "Allows the AI to programmatically modify the UI (e.g., automatically adding study blocks to the calendar or drafting notes in the Co-Writer).", ACCENT_GREEN)

    # --- Slide 5: Deep Capabilities & Agent Tools ---
    s5 = prs.slides.add_slide(blank_layout)
    add_background(s5, prs)
    add_header(s5, "CAPABILITIES & LEVEL 1 TOOLS", "The intelligent services empowering the custom Socratic Tutor Bot.")
    
    tx1 = s5.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(5.0), Inches(0.5))
    p1 = tx1.text_frame.paragraphs[0]
    p1.text = "Multi-Step Capabilities"
    p1.font.bold = True
    p1.font.size = Pt(20)
    p1.font.color.rgb = ACCENT_PURPLE
    
    caps = [
        ("chat", "Tool-augmented conversational tutoring."),
        ("deepsolve", "Multi-stage path planning and reasoning."),
        ("quiz_generation", "Ideation and generation of custom mock exams."),
        ("deep_research", "Multi-agent deep exploration and reporting."),
        ("math_animator", "Translates concepts into dynamic Manim video renders.")
    ]
    for i, (name, desc) in enumerate(caps):
        add_card(s5, Inches(1.0), Inches(2.6 + i*0.8), Inches(5.0), Inches(0.7), f"• {name}", desc, ACCENT_PURPLE)
        
    tx2 = s5.shapes.add_textbox(Inches(7.33), Inches(2.0), Inches(5.0), Inches(0.5))
    p2 = tx2.text_frame.paragraphs[0]
    p2.text = "On-Demand Level 1 Tools"
    p2.font.bold = True
    p2.font.size = Pt(20)
    p2.font.color.rgb = ACCENT_BLUE
    
    tools = [
        ("rag", "Hyper-personalized knowledge base retrieval."),
        ("web_search", "Live search with citations (duckduckgo)."),
        ("code_execution", "Sandboxed Python execution for live practice."),
        ("reason", "Dedicated deep-reasoning LLM logic paths."),
        ("arxiv_search", "Academic paper search for deep academic dives."),
        ("brainstorm", "Breadth-first idea exploration with rationales.")
    ]
    for i, (name, desc) in enumerate(tools):
        add_card(s5, Inches(7.33), Inches(2.6 + i*0.75), Inches(5.0), Inches(0.65), f"• {name}", desc, ACCENT_BLUE)

    # --- Slide 6: Workspace Tools ---
    s6 = prs.slides.add_slide(blank_layout)
    add_background(s6, prs)
    add_header(s6, "THE LEARNING WORKSPACE", "10 specialized tools catering to visual, auditory, and active learning styles.")
    
    add_card(s6, Inches(0.5), Inches(2.0), Inches(6.0), Inches(2.5), "Visual & Audio Mastery", 
             "• Whiteboard: Infinite digital canvas that converts handwritten sketches and concepts into precise interactive diagrams, models, and visual concepts for any subject.\n"
             "• Mindmap: Parses dense documents and diagrams into interactive, structured semantic node graphs.\n"
             "• Slide Deck: Instantly compiles study material into structured slides.\n"
             "• Podcast: Converts text/notes to a script for a 2-person audio discussion.", ACCENT_PURPLE)
             
    add_card(s6, Inches(6.83), Inches(2.0), Inches(6.0), Inches(2.5), "Productivity & Focus", 
             "• Study Planner: Adaptive organizer aligning with personal energy levels.\n"
             "• Focus Mode: Distraction-free space blocking cognitive overload.\n"
             "• Co-Writer: Cooperative drafting tool for overcoming blank-page anxiety.", ACCENT_BLUE)
             
    add_card(s6, Inches(0.5), Inches(4.8), Inches(12.33), Inches(2.0), "Active Recall & Exam Preparation", 
             "• Guided Learning: Socratic curriculum paths rendered as rich interactive HTML pages.\n"
             "• Flash Cards: Spaced-repetition card decks generated directly from notes.\n"
             "• Exam Simulator: Dynamic mock exams with automated grading and diagnostics.", TEXT_WHITE)

    # --- Slide 7: Cognitive Impact & Engagement ---
    s7 = prs.slides.add_slide(blank_layout)
    add_background(s7, prs)
    add_header(s7, "COGNITIVE IMPACT & ENGAGEMENT", "Measurable benefits for neurodivergent learners.")
    
    add_metric_card(s7, Inches(0.5), Inches(2.5), Inches(2.8), Inches(3.0), "24/7", "Unlimited access to patient, empathetic Socratic tutoring.", ACCENT_PURPLE)
    add_metric_card(s7, Inches(3.7), Inches(2.5), Inches(2.8), Inches(3.0), "$0", "Spent on expensive, scheduling-restricted private tutors.", ACCENT_BLUE)
    add_metric_card(s7, Inches(6.9), Inches(2.5), Inches(2.8), Inches(3.0), "2x", "Increase in comprehension and long-term active recall.", ACCENT_PURPLE)
    add_metric_card(s7, Inches(10.1), Inches(2.5), Inches(2.7), Inches(3.0), "100%", "Learning autonomy tailored to personal pacing.", ACCENT_BLUE)

    output_path = "studypal_custom_deck.pptx"
    prs.save(output_path)
    print(f"Successfully generated custom presentation: {output_path}")

if __name__ == "__main__":
    build_presentation()
