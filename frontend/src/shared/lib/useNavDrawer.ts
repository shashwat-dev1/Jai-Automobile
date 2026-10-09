import { create } from 'zustand'

interface NavDrawerState {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export const useNavDrawer = create<NavDrawerState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}))
