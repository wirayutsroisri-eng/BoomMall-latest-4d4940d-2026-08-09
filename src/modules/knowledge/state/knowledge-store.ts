import { create } from 'zustand';
import {
  initKnowledgeDb,
  listArticles,
  listVehicles,
  saveArticleOffline,
} from '../data/knowledge-db';
import type { KnowledgeArticle, VehicleLog } from '../domain/types';

type KnowledgeState = {
  ready: boolean;
  articles: KnowledgeArticle[];
  vehicles: VehicleLog[];
  hydrate: () => Promise<void>;
  toggleOffline: (id: string) => Promise<void>;
};

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  ready: false,
  articles: [],
  vehicles: [],
  hydrate: async () => {
    await initKnowledgeDb();
    const [articles, vehicles] = await Promise.all([listArticles(), listVehicles()]);
    set({ articles, vehicles, ready: true });
  },
  toggleOffline: async (id) => {
    const current = get().articles.find((a) => a.id === id);
    if (!current) return;
    const next = !current.savedOffline;
    await saveArticleOffline(id, next);
    set({
      articles: get().articles.map((a) =>
        a.id === id ? { ...a, savedOffline: next } : a,
      ),
    });
  },
}));
