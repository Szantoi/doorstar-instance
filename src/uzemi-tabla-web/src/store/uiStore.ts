import { create } from "zustand";
import { monday, shiftWeek } from "@/lib/dates";

export type Role = "vezeto" | "allomas";

interface UiState {
  role: Role;
  myStation: string;
  week: string;
  setRole: (role: Role) => void;
  setMyStation: (station: string) => void;
  prevWeek: () => void;
  nextWeek: () => void;
  goToday: () => void;
  setWeek: (week: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  role: "vezeto",
  myStation: "CNC",
  week: monday(new Date()),
  setRole: (role) => set({ role }),
  setMyStation: (myStation) => set({ myStation }),
  prevWeek: () => set((s) => ({ week: shiftWeek(s.week, -1) })),
  nextWeek: () => set((s) => ({ week: shiftWeek(s.week, 1) })),
  goToday: () => set({ week: monday(new Date()) }),
  setWeek: (week) => set({ week }),
}));
