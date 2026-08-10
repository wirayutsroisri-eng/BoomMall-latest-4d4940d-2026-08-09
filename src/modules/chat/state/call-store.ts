import { create } from 'zustand';
import type { CallMode, CallType } from '../domain/types';

type CallState = {
  mode: CallMode;
  type: CallType;
  peerName: string | null;
  muted: boolean;
  cameraOff: boolean;
  startCall: (peerName: string, type: CallType) => void;
  setActive: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
};

export const useCallStore = create<CallState>((set) => ({
  mode: 'idle',
  type: 'voice',
  peerName: null,
  muted: false,
  cameraOff: false,
  startCall: (peerName, type) =>
    set({ mode: 'connecting', peerName, type, muted: false, cameraOff: false }),
  setActive: () => set({ mode: 'active' }),
  endCall: () => set({ mode: 'idle', peerName: null }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleCamera: () => set((s) => ({ cameraOff: !s.cameraOff })),
}));
