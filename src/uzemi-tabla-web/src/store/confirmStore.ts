import { create } from "zustand";

interface ConfirmState {
  message: string | null;
  resolver: ((value: boolean) => void) | null;
  ask: (message: string) => Promise<boolean>;
  respond: (value: boolean) => void;
}

/** Imperative Igen/Mégse confirmation, mirroring the design mock's
 * confirmAction() — used to guard destructive actions instead of letting
 * them fire immediately. */
export const useConfirmStore = create<ConfirmState>((set, get) => ({
  message: null,
  resolver: null,
  ask: (message) =>
    new Promise((resolve) => {
      set({ message, resolver: resolve });
    }),
  respond: (value) => {
    get().resolver?.(value);
    set({ message: null, resolver: null });
  },
}));
