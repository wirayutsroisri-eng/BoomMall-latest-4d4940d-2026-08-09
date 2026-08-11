export type JobCategory = 'Garden/Handyman' | 'Electrician' | 'EV/Mechanic' | 'HVAC';

export type GeoPoint = {
  lat: number;
  lng: number;
};

export type ServiceProvider = {
  id: string;
  name: string;
  handle: string;
  avatarColor: string;
  skills: string[];
  categories: JobCategory[];
  gps: GeoPoint;
  isActive: boolean;
};

export type MatchedProvider = {
  provider: ServiceProvider;
  distanceKm: number;
  overlappingSkills: string[];
};

export type { JobMatchCard } from '@/modules/chat/domain/types';

export type ExtractedJobKeywords = {
  skills: string[];
  categories: JobCategory[];
};

export type MatchingResult = {
  feedId: string;
  extracted: ExtractedJobKeywords;
  matched: MatchedProvider[];
  minDistanceKm: number | null;
  /** Resolved search radius in km (Infinity = All Area). */
  searchRadiusKm: number;
};

export type MatchingNotifyItem = {
  id: string;
  title: string;
  body: string;
  conversationId?: string;
  createdAt: string;
};
