import {
  db,
  eq,
  and,
  gte,
  lte,
  desc,
  asc,
  sql,
  count,
  sum,
  isNull,
  inArray,
  stakeVault,
  stakeRewardAccount,
  stakedNft,
  stakingEvent,
  rewardClaim,
  stakingSnapshot,
  collection,
  nft,
} from "database";

export class StakingService {
  // Obtener todos los vaults o uno específico
  async getVaults(address?: string) {
    if (address) {
      return await db.query.stakeVault.findFirst({
        where: (vault, { eq }) => eq(vault.address, address),
        with: {
          rewardAccounts: true,
        },
      });
    }

    return await db.query.stakeVault.findMany({
      orderBy: (vault, { desc }) => desc(vault.createdAt),
      with: {
        rewardAccounts: true,
      },
    });
  }

  // Obtener reward accounts de un vault
  async getRewardAccounts(vaultAddress: string) {
    return await db.query.stakeRewardAccount.findMany({
      where: (account, { eq }) => eq(account.vaultAddress, vaultAddress),
      orderBy: (account, { desc }) => desc(account.createdAt),
    });
  }

  // Obtener NFTs stakeados por usuario
  async getStakedNftsByUser(
    userAddress: string,
    filters?: { vaultAddress?: string; collectionAddress?: string }
  ) {
    const conditions = [
      eq(stakedNft.stakerAddress, userAddress),
      isNull(stakedNft.unstakedAtHeight),
    ];

    if (filters?.vaultAddress) {
      conditions.push(eq(stakedNft.vaultAddress, filters.vaultAddress));
    }

    if (filters?.collectionAddress) {
      conditions.push(eq(stakedNft.collectionAddress, filters.collectionAddress));
    }

    return await db.query.stakedNft.findMany({
      where: (stakedNft, { and, eq, isNull }) => and(...conditions),
      orderBy: (stakedNft, { desc }) => desc(stakedNft.stakedAt),
      with: {
        nft: {
          with: {
            collection: true,
          },
        },
        vault: true,
        collection: true,
      },
    });
  }

  // Obtener NFTs stakeados en un vault
  async getStakedNftsByVault(
    vaultAddress: string,
    filters?: { collectionAddress?: string; limit?: number; offset?: number }
  ) {
    const conditions = [
      eq(stakedNft.vaultAddress, vaultAddress),
      isNull(stakedNft.unstakedAtHeight),
    ];

    if (filters?.collectionAddress) {
      conditions.push(eq(stakedNft.collectionAddress, filters.collectionAddress));
    }

    let query = db
      .select()
      .from(stakedNft)
      .where(and(...conditions))
      .orderBy(desc(stakedNft.stakedAt));

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.offset(filters.offset);
    }

    return await query;
  }

  // Obtener recompensas pendientes (estimadas desde snapshots)
  async getPendingRewards(
    userAddress: string,
    vaultAddress?: string,
    rewardAccountAddress?: string
  ) {
    const conditions = [
      eq(stakingSnapshot.userAddress, userAddress),
      eq(stakingSnapshot.snapshotType, "user"),
    ];

    if (vaultAddress) {
      conditions.push(eq(stakingSnapshot.vaultAddress, vaultAddress));
    }

    if (rewardAccountAddress) {
      conditions.push(eq(stakingSnapshot.rewardAccountAddress, rewardAccountAddress));
    }

    // Obtener el último snapshot de cada reward account
    const latestSnapshots = await db
      .select({
        rewardAccountAddress: stakingSnapshot.rewardAccountAddress,
        pendingRewards: stakingSnapshot.userPendingRewards,
        rewardAssetDenom: stakeRewardAccount.rewardAssetDenom,
        rewardAssetType: stakeRewardAccount.rewardAssetType,
        snapshotTime: stakingSnapshot.snapshotTime,
      })
      .from(stakingSnapshot)
      .innerJoin(
        stakeRewardAccount,
        eq(stakingSnapshot.rewardAccountAddress, stakeRewardAccount.address)
      )
      .where(and(...conditions))
      .orderBy(desc(stakingSnapshot.snapshotTime))
      .groupBy(
        stakingSnapshot.rewardAccountAddress,
        stakingSnapshot.userPendingRewards,
        stakingSnapshot.snapshotTime,
        stakeRewardAccount.rewardAssetDenom,
        stakeRewardAccount.rewardAssetType
      )
      .limit(100); // Limitar a los últimos 100 reward accounts

    // Agrupar por reward account y tomar el más reciente
    const grouped = new Map<string, typeof latestSnapshots[0]>();
    for (const snapshot of latestSnapshots) {
      const existing = grouped.get(snapshot.rewardAccountAddress);
      if (!existing || snapshot.snapshotTime > existing.snapshotTime) {
        grouped.set(snapshot.rewardAccountAddress, snapshot);
      }
    }

    return Array.from(grouped.values());
  }

  // Obtener historial de recompensas
  async getRewardHistory(
    userAddress: string,
    filters?: {
      vaultAddress?: string;
      rewardAccountAddress?: string;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    }
  ) {
    const conditions = [eq(rewardClaim.userAddress, userAddress)];

    if (filters?.vaultAddress) {
      conditions.push(eq(rewardClaim.vaultAddress, filters.vaultAddress));
    }

    if (filters?.rewardAccountAddress) {
      conditions.push(eq(rewardClaim.rewardAccountAddress, filters.rewardAccountAddress));
    }

    if (filters?.fromDate) {
      conditions.push(gte(rewardClaim.claimedAt, filters.fromDate));
    }

    if (filters?.toDate) {
      conditions.push(lte(rewardClaim.claimedAt, filters.toDate));
    }

    let query = db
      .select()
      .from(rewardClaim)
      .where(and(...conditions))
      .orderBy(desc(rewardClaim.claimedAt));

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.offset(filters.offset);
    }

    const claims = await query;

    // Obtener información adicional de reward accounts
    const rewardAccountAddresses = [...new Set(claims.map((c) => c.rewardAccountAddress))];
    const rewardAccounts = await db.query.stakeRewardAccount.findMany({
      where: (account, { inArray, eq }) => inArray(account.address, rewardAccountAddresses),
    });

    const rewardAccountMap = new Map(rewardAccounts.map((ra) => [ra.address, ra]));

    return claims.map((claim) => ({
      ...claim,
      rewardAccount: rewardAccountMap.get(claim.rewardAccountAddress),
    }));
  }

  // Obtener métricas de staking
  async getStakingMetrics(
    vaultAddress: string,
    filters?: {
      fromDate?: Date;
      toDate?: Date;
      groupBy?: "day" | "week" | "month";
      snapshotType?: "global_vault" | "global_reward" | "user";
      rewardAccountAddress?: string;
    }
  ) {
    const conditions = [
      eq(stakingSnapshot.vaultAddress, vaultAddress),
      eq(stakingSnapshot.snapshotType, filters?.snapshotType || "global_vault"),
    ];

    if (filters?.fromDate) {
      conditions.push(gte(stakingSnapshot.snapshotTime, filters.fromDate));
    }

    if (filters?.toDate) {
      conditions.push(lte(stakingSnapshot.snapshotTime, filters.toDate));
    }

    if (filters?.rewardAccountAddress) {
      conditions.push(eq(stakingSnapshot.rewardAccountAddress, filters.rewardAccountAddress));
    }

    // Agrupar por período según groupBy
    let dateTrunc = "day";
    if (filters?.groupBy === "week") {
      dateTrunc = "week";
    } else if (filters?.groupBy === "month") {
      dateTrunc = "month";
    }

    return await db
      .select({
        period: sql<string>`DATE_TRUNC('${sql.raw(dateTrunc)}', ${stakingSnapshot.snapshotTime})`.as("period"),
        avgTotalStaked: sql<number>`AVG(${stakingSnapshot.totalStaked}::numeric)`.as("avg_total_staked"),
        maxTotalStaked: sql<number>`MAX(${stakingSnapshot.totalStaked}::numeric)`.as("max_total_staked"),
        minTotalStaked: sql<number>`MIN(${stakingSnapshot.totalStaked}::numeric)`.as("min_total_staked"),
        avgTotalStakers: sql<number>`AVG(${stakingSnapshot.totalStakers})`.as("avg_total_stakers"),
        totalRewardsDistributed: sql<number>`SUM(${stakingSnapshot.totalRewardsDistributed}::numeric)`.as(
          "total_rewards_distributed"
        ),
      })
      .from(stakingSnapshot)
      .where(and(...conditions))
      .groupBy(sql`DATE_TRUNC('${sql.raw(dateTrunc)}', ${stakingSnapshot.snapshotTime})`)
      .orderBy(asc(sql`DATE_TRUNC('${sql.raw(dateTrunc)}', ${stakingSnapshot.snapshotTime})`));
  }

  // Obtener estadísticas de usuario
  async getUserStakingStats(userAddress: string) {
    // Total NFTs stakeados
    const totalStakedResult = await db
      .select({ count: count() })
      .from(stakedNft)
      .where(and(eq(stakedNft.stakerAddress, userAddress), isNull(stakedNft.unstakedAtHeight)));

    // Total recompensas reclamadas
    const totalRewards = await db
      .select({
        total: sum(rewardClaim.amount),
        denom: rewardClaim.denom,
      })
      .from(rewardClaim)
      .where(eq(rewardClaim.userAddress, userAddress))
      .groupBy(rewardClaim.denom);

    // Vaults en los que participa
    const vaults = await db
      .selectDistinct({ vaultAddress: stakedNft.vaultAddress })
      .from(stakedNft)
      .where(and(eq(stakedNft.stakerAddress, userAddress), isNull(stakedNft.unstakedAtHeight)));

    // Colecciones en las que tiene NFTs stakeados
    const collections = await db
      .selectDistinct({
        collectionAddress: stakedNft.collectionAddress,
        count: count(),
      })
      .from(stakedNft)
      .where(and(eq(stakedNft.stakerAddress, userAddress), isNull(stakedNft.unstakedAtHeight)))
      .groupBy(stakedNft.collectionAddress);

    return {
      totalStakedNfts: totalStakedResult[0]?.count || 0,
      totalRewardsClaimed: totalRewards,
      activeVaults: vaults.length,
      collections: collections.map((c) => ({
        collectionAddress: c.collectionAddress,
        stakedCount: c.count,
      })),
    };
  }

  // Obtener top stakers
  async getTopStakers(vaultAddress: string, limit: number = 10) {
    return await db
      .select({
        stakerAddress: stakedNft.stakerAddress,
        stakedCount: count(),
      })
      .from(stakedNft)
      .where(and(eq(stakedNft.vaultAddress, vaultAddress), isNull(stakedNft.unstakedAtHeight)))
      .groupBy(stakedNft.stakerAddress)
      .orderBy(desc(count()))
      .limit(limit);
  }

  // Obtener estadísticas de un vault
  async getVaultStats(vaultAddress: string) {
    // Total stakeado
    const totalStakedResult = await db
      .select({ count: count() })
      .from(stakedNft)
      .where(and(eq(stakedNft.vaultAddress, vaultAddress), isNull(stakedNft.unstakedAtHeight)));

    // Total stakers únicos
    const totalStakersResult = await db
      .selectDistinct({ staker: stakedNft.stakerAddress })
      .from(stakedNft)
      .where(and(eq(stakedNft.vaultAddress, vaultAddress), isNull(stakedNft.unstakedAtHeight)));

    // Distribución por colección
    const collectionDistribution = await db
      .select({
        collectionAddress: stakedNft.collectionAddress,
        count: count(),
      })
      .from(stakedNft)
      .where(and(eq(stakedNft.vaultAddress, vaultAddress), isNull(stakedNft.unstakedAtHeight)))
      .groupBy(stakedNft.collectionAddress);

    // Reward accounts
    const rewardAccounts = await this.getRewardAccounts(vaultAddress);

    // Total recompensas distribuidas
    const totalRewardsDistributed = await db
      .select({
        total: sum(rewardClaim.amount),
        denom: rewardClaim.denom,
      })
      .from(rewardClaim)
      .where(eq(rewardClaim.vaultAddress, vaultAddress))
      .groupBy(rewardClaim.denom);

    return {
      totalStaked: totalStakedResult[0]?.count || 0,
      totalStakers: totalStakersResult.length,
      collectionDistribution: collectionDistribution.map((c) => ({
        collectionAddress: c.collectionAddress,
        stakedCount: c.count,
      })),
      rewardAccounts: rewardAccounts.length,
      totalRewardsDistributed,
    };
  }

  // Obtener historial de eventos
  async getStakingEvents(
    filters?: {
      vaultAddress?: string;
      userAddress?: string;
      eventType?: "stake" | "unstake" | "claim" | "claim_rewards" | "create_reward_account";
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    }
  ) {
    const conditions = [];

    if (filters?.vaultAddress) {
      conditions.push(eq(stakingEvent.vaultAddress, filters.vaultAddress));
    }

    if (filters?.userAddress) {
      conditions.push(eq(stakingEvent.userAddress, filters.userAddress));
    }

    if (filters?.eventType) {
      conditions.push(eq(stakingEvent.eventType, filters.eventType));
    }

    if (filters?.fromDate) {
      conditions.push(gte(stakingEvent.blockTime, filters.fromDate));
    }

    if (filters?.toDate) {
      conditions.push(lte(stakingEvent.blockTime, filters.toDate));
    }

    let query = db
      .select()
      .from(stakingEvent)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(stakingEvent.blockTime));

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.offset(filters.offset);
    }

    return await query;
  }
}

