import React from 'react';
import { HomeFeedScreen } from '@/modules/feed/ui/HomeFeedScreen';
import { ShopScreen } from '@/modules/shop/ui/ShopScreen';
import { SocialChannelScreen } from '../ui/SocialChannelScreen';
import { JobsChannelScreen } from '../ui/JobsChannelScreen';
import type { MainChannel, MainChannelScreenProps } from '../domain/types';

function NearbyChannel({ active, onVerticalScroll }: MainChannelScreenProps) {
  return <SocialChannelScreen kind="nearby" active={active} onVerticalScroll={onVerticalScroll} />;
}
function JobsChannel({ active, onVerticalScroll }: MainChannelScreenProps) {
  return <JobsChannelScreen active={active} onVerticalScroll={onVerticalScroll} />;
}
function SecondhandChannel({ active, onVerticalScroll }: MainChannelScreenProps) {
  return <SocialChannelScreen kind="secondhand" active={active} onVerticalScroll={onVerticalScroll} />;
}
function ShopChannel({ onVerticalScroll }: MainChannelScreenProps) {
  return <ShopScreen embedded onVerticalScroll={onVerticalScroll} />;
}
function FeedChannel({ active, onVerticalScroll }: MainChannelScreenProps) {
  return <SocialChannelScreen kind="feed" active={active} onVerticalScroll={onVerticalScroll} />;
}
function ClipsChannel({ active }: MainChannelScreenProps) {
  return <HomeFeedScreen channelEmbedded channelActive={active} renderMediaViewer={false} />;
}

/** Extensible registry: add/reorder main content without touching Bottom Tabs. */
export const MAIN_CHANNELS: MainChannel[] = [
  { id: 'nearby', title: 'ใกล้คุณ', enabled: true, order: 10, component: NearbyChannel },
  { id: 'jobs', title: 'หางาน', enabled: true, order: 20, component: JobsChannel },
  { id: 'secondhand', title: 'มือสอง', enabled: true, order: 30, component: SecondhandChannel },
  { id: 'shop', title: 'ร้านค้า', enabled: true, order: 40, component: ShopChannel },
  { id: 'feed', title: 'ฟีด', enabled: true, order: 50, component: FeedChannel },
  { id: 'clips', title: 'คลิป', enabled: true, order: 60, component: ClipsChannel },
];

export function enabledMainChannels() {
  return MAIN_CHANNELS.filter((channel) => channel.enabled).sort((a, b) => a.order - b.order);
}
