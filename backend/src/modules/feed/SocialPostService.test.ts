import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    socialPost: {
      findFirst: mocks.findFirst,
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

import { deleteSocialPost } from './SocialPostService';

describe('deleteSocialPost ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({ id: 'post-1' });
  });

  it('soft-deletes the record by ID when the requester owns it', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'post-1', authorId: 'owner-1' });
    mocks.update.mockResolvedValue({ id: 'post-1', status: 'REMOVED' });

    await expect(deleteSocialPost('post-1', 'owner-1')).resolves.toBe(true);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { status: 'REMOVED' },
    });
  });

  it('does not mutate a post owned by another user', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'post-1', authorId: 'owner-1' });

    await expect(deleteSocialPost('post-1', 'attacker-1')).resolves.toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
