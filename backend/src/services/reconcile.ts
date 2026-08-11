import { AccountBucket, PrismaClient, WalletKind } from '@prisma/client';

/**
 * Total Supply invariant:
 *   User + Seller + Treasury + Pools  ===  SystemSupply.totalMinted
 * SYSTEM_MINT contra balance equals totalMinted (tracking only).
 */
export async function reconcileLedger(prisma: PrismaClient) {
  const supply = await prisma.systemSupply.findUnique({ where: { id: 1 } });
  if (!supply) {
    return {
      ok: false as const,
      error: 'SYSTEM_SUPPLY_MISSING',
      totalMinted: '0',
      accountedSupply: '0',
      delta: '0',
      breakdown: {},
    };
  }

  const accounts = await prisma.walletAccount.findMany({
    where: { bucket: AccountBucket.AVAILABLE },
    include: { wallet: true },
  });

  const breakdown: Record<string, string> = {
    USER: '0',
    SELLER: '0',
    TREASURY: '0',
    REWARD_POOL: '0',
    SYSTEM_MINT: '0',
  };

  let circulating = 0n;
  let poolsAndTreasury = 0n;
  let mintContra = 0n;

  for (const a of accounts) {
    const kind = a.wallet.kind;
    breakdown[kind] = (BigInt(breakdown[kind] ?? '0') + a.balance).toString();

    if (kind === WalletKind.SYSTEM_MINT) {
      mintContra += a.balance;
      continue;
    }
    if (kind === WalletKind.USER || kind === WalletKind.SELLER) {
      circulating += a.balance;
    } else {
      poolsAndTreasury += a.balance;
    }
  }

  const accountedSupply = circulating + poolsAndTreasury;
  const delta = accountedSupply - supply.totalMinted;
  const mintTracks = mintContra === supply.totalMinted;

  return {
    ok: delta === 0n && mintTracks,
    totalMinted: supply.totalMinted.toString(),
    accountedSupply: accountedSupply.toString(),
    circulatingSupply: circulating.toString(),
    treasuryAndPools: poolsAndTreasury.toString(),
    systemMintContra: mintContra.toString(),
    delta: delta.toString(),
    mintContraMatchesTotalMinted: mintTracks,
    breakdown,
    checkedAt: new Date().toISOString(),
  };
}
