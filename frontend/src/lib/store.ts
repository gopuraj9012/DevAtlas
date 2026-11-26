import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ShellState {
  collapsed: boolean;
  toggle: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}

export const useShell = create<ShellState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      searchOpen: false,
      setSearchOpen: (open) => set({ searchOpen: open }),
    }),
    { name: "devatlas-shell", partialize: (s) => ({ collapsed: s.collapsed }) },
  ),
);
