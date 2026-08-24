import { describe, expect, it } from 'vitest';
import type { FeedItem } from '@/modules/feed/domain/types';
import { buildOwnerFeedItems } from './buildOwnerFeedItems';

function item(id: string, authorId: string, isUserPost = true): FeedItem {
  return {
    id,
    authorId,
    author: 'User',
    authorHandle: '@boommall_user',
    caption: id,
    location: 'จันทบุรี',
    likes: 0,
    comments: 0,
    shares: 0,
    isLive: false,
    musicTitle: '',
    gradient: ['#000000', '#111111'],
    imageUri: 'https://cdn.example.com/post.jpg',
    isUserPost,
    product: {
      id: `product-${id}`,
      name: id,
      shopName: 'User',
      tier: 'C2C',
      basePrice: 0,
      currency: 'THB',
      variants: [],
      tags: [],
    },
  };
}

describe('buildOwnerFeedItems account isolation', () => {
  it('does not show a previous account post merely because isUserPost was persisted', () => {
    const rows = buildOwnerFeedItems('@boommall_user', [
      item('old-account-post', 'old-user'),
      item('current-account-post', 'new-user'),
    ], {
      isSelf: true,
      ownerUserId: 'new-user',
    });

    expect(rows.map((row) => row.id)).toEqual(['current-account-post']);
  });
});
