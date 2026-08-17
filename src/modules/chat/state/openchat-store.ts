import { create } from 'zustand';
import type { OpenChatGroup } from '../domain/types';

type OpenChatState = {
  groups: OpenChatGroup[];
  toggleJoin: (groupId: string) => void;
};

export const useOpenChatStore = create<OpenChatState>((set) => ({
  groups: [],
  toggleJoin: (groupId) =>
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              isJoined: !g.isJoined,
              memberCount: g.isJoined ? g.memberCount - 1 : g.memberCount + 1,
            }
          : g,
      ),
    })),
}));
