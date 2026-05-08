import {
  GraduationCap,
  Headphones,
  Layers,
  ListChecks,
  Network,
  PenLine,
  PenSquare,
  Presentation,
  Timer,
  type LucideIcon,
} from "lucide-react";

export interface ToolDefinition {
  id: string;
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: "Creative" | "Learning" | "Practice" | "Productivity";
}

export const TOOLS: ToolDefinition[] = [
  {
    id: "focus",
    href: "/focus",
    label: "Focus",
    description: "Stay productive with a dedicated study timer and distraction-free environment.",
    icon: Timer,
    category: "Productivity",
  },
  {
    id: "co-writer",
    href: "/co-writer",
    label: "Co-Writer",
    description: "Collaborate with AI to draft essays, notes, and structured documents.",
    icon: PenLine,
    category: "Creative",
  },
  {
    id: "guide",
    href: "/guide",
    label: "Guided Learning",
    description: "Follow AI-structured pathways to master complex topics step-by-step.",
    icon: GraduationCap,
    category: "Learning",
  },
  {
    id: "whiteboard",
    href: "/whiteboard",
    label: "Whiteboard",
    description: "Visualize ideas, draw diagrams, and solve problems on a free-form digital canvas.",
    icon: PenSquare,
    category: "Creative",
  },
  {
    id: "mindmap",
    href: "/mindmap",
    label: "Mindmap",
    description: "Generate and explore concept maps to see the big picture of your studies.",
    icon: Network,
    category: "Creative",
  },
  {
    id: "podcasts",
    href: "/podcasts",
    label: "Podcasts",
    description: "Turn your study notes and topics into listenable, conversational audio.",
    icon: Headphones,
    category: "Learning",
  },
  {
    id: "decks",
    href: "/decks",
    label: "Decks",
    description: "Turn notes and topics into polished slide presentations.",
    icon: Presentation,
    category: "Creative",
  },
  {
    id: "flashcards",
    href: "/flashcards",
    label: "Flashcards",
    description: "Generate AI-powered flashcards on any topic and self-grade as you go.",
    icon: Layers,
    category: "Practice",
  },
  {
    id: "exam",
    href: "/exam",
    label: "Exam Simulator",
    description: "Test your knowledge with realistic exam scenarios and instant feedback.",
    icon: ListChecks,
    category: "Practice",
  },
];
