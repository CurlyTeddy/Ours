import type { NoteColor } from "@/features/moments/models/requests";

const noteColorStyles: Record<NoteColor, { name: string; hex: string }> = {
  mist: { name: "Mist", hex: "#D3E0F4" },
  butter: { name: "Butter", hex: "#FAEDBE" },
  blush: { name: "Blush", hex: "#F7D9DC" },
  mint: { name: "Mint", hex: "#D6ECDF" },
  lilac: { name: "Lilac", hex: "#E2DCF3" },
  paper: { name: "Paper", hex: "#FFFDF7" },
};

export { noteColorStyles };
