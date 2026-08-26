export type WeightedInterest = {
  tag: string;
  normalizedTag: string;
  weight: number;
  source: string;
  lastSeenAt: string;
};

export type InterestProfileDto = {
  userId: string;
  explicitInterests: WeightedInterest[];
  occupation: string | null;
  occupationVisible: boolean;
  careerField: string | null;
  careerFieldVisible: boolean;
  skills: string[];
  skillsVisible: boolean;
  interestsVisible: boolean;
  preferredCategories: string[];
  categoriesVisible: boolean;
  behavioralInterests: WeightedInterest[];
  searchInterests: WeightedInterest[];
  locationPreferences: WeightedInterest[];
  personalizationEnabled: boolean;
  updatedAt: string;
};

export function normalizeTag(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('th-TH').replace(/\s+/g, ' ');
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function weightedArray(value: unknown): WeightedInterest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Partial<WeightedInterest>;
    if (typeof row.tag !== 'string' || typeof row.normalizedTag !== 'string') return [];
    return [{
      tag: row.tag,
      normalizedTag: row.normalizedTag,
      weight: Number.isFinite(row.weight) ? Number(row.weight) : 0,
      source: typeof row.source === 'string' ? row.source : 'PROFILE',
      lastSeenAt: typeof row.lastSeenAt === 'string' ? row.lastSeenAt : new Date(0).toISOString(),
    }];
  });
}
