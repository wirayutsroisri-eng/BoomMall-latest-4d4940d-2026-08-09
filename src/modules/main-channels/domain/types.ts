import type React from 'react';

export type MainChannelId = 'nearby' | 'jobs' | 'secondhand' | 'shop' | 'feed' | 'clips' | (string & {});

export type MainChannelScreenProps = {
  active: boolean;
  onVerticalScroll?: (offsetY: number) => void;
};

export type MainChannel = {
  id: MainChannelId;
  title: string;
  enabled: boolean;
  order: number;
  component: React.ComponentType<MainChannelScreenProps>;
};

export type NearbyContentKind = 'post' | 'check-in' | 'shop' | 'secondhand' | 'job' | 'event';

export type NearbyContentQuery = {
  kind?: NearbyContentKind;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  cursor?: string;
  limit?: number;
};

export type JobChannelItem = {
  id: string;
  title: string;
  companyName: string;
  compensation?: string;
  area?: string;
  description: string;
  publishedAt: string;
  contactUserId?: string;
};
