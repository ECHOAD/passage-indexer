import { db, eq, and, isNull, count, sum, max, desc, stakeVault, stakeRewardAccount, stakedNft, rewardClaim, stakingSnapshot, StakingSnapshotInsert, block } from "database";
import { nodeAccessor } from "@src/chain/nodeAccessor";


export async function createStakingSnapshots() {
  console.log("Creating staking snapshots...");

  try {
    const [{ maxHeight }] = await db.select({ maxHeight: max(block.height) }).from(block);
    const currentHeight = maxHeight || 0;
    
    if (!currentHeight) {
      console.log("Could not get current block height, skipping snapshots");
      return;
    }

    const currentBlock = await db.query.block.findFirst({
      where: (block, { eq }) => eq(block.height, currentHeight),
    });

    if (!currentBlock) {
      console.log(`Block ${currentHeight} not found, skipping snapshots`);
      return;
    }

    const vaults = await db.query.stakeVault.findMany();

    for (const vault of vaults) {
      const totalStakedResult = await db
        .select({ total: count() })
        .from(stakedNft)
        .where(and(eq(stakedNft.vaultAddress, vault.address), isNull(stakedNft.unstakedAtHeight)));

      const totalStaked = totalStakedResult[0]?.total || 0;

      const stakersResult = await db
        .selectDistinct({ staker: stakedNft.stakerAddress })
        .from(stakedNft)
        .where(and(eq(stakedNft.vaultAddress, vault.address), isNull(stakedNft.unstakedAtHeight)));

      const totalStakers = stakersResult.length;

      const rewardAccounts = await db.query.stakeRewardAccount.findMany({
        where: (account, { eq }) => eq(account.vaultAddress, vault.address),
      });

      for (const rewardAccount of rewardAccounts) {
        const totalRewardsResult = await db
          .select({ total: sum(rewardClaim.amount) })
          .from(rewardClaim)
          .where(eq(rewardClaim.rewardAccountAddress, rewardAccount.address));

        const totalRewardsDistributed = totalRewardsResult[0]?.total || "0";

        const rewardsPerToken = "0";

        // Snapshot global del vault + reward account
        const globalRewardSnapshot: StakingSnapshotInsert = {
          snapshotType: "global_reward",
          vaultAddress: vault.address,
          rewardAccountAddress: rewardAccount.address,
          snapshotTime: currentBlock.datetime,
          height: currentHeight,
          totalStaked: totalStaked.toString(),
          totalStakers,
          totalRewardsDistributed,
          rewardsPerToken,
        };

        await db.insert(stakingSnapshot).values(globalRewardSnapshot);


        const activeStakers = await db
          .selectDistinct({ staker: stakedNft.stakerAddress })
          .from(stakedNft)
          .where(and(eq(stakedNft.vaultAddress, vault.address), isNull(stakedNft.unstakedAtHeight)))
          .limit(1000); 

        for (const { staker } of activeStakers) {
          const userStakedResult = await db
            .select({ total: count() })
            .from(stakedNft)
            .where(
              and(
                eq(stakedNft.vaultAddress, vault.address),
                eq(stakedNft.stakerAddress, staker),
                isNull(stakedNft.unstakedAtHeight)
              )
            );

          const userStakedAmount = userStakedResult[0]?.total || 0;

          const lastClaim = await db.query.rewardClaim.findFirst({
            where: (claim, { and, eq }) =>
              and(eq(claim.rewardAccountAddress, rewardAccount.address), eq(claim.userAddress, staker)),
            orderBy: (claim, { desc }) => desc(claim.claimedAt),
          });


          const userPendingRewards = "0";

          // Snapshot por usuario específico
          const userSnapshot: StakingSnapshotInsert = {
            snapshotType: "user",
            vaultAddress: vault.address,
            rewardAccountAddress: rewardAccount.address,
            userAddress: staker,
            snapshotTime: currentBlock.datetime,
            height: currentHeight,
            totalStaked: totalStaked.toString(),
            totalStakers,
            totalRewardsDistributed,
            rewardsPerToken,
            userStakedAmount: userStakedAmount.toString(),
            userPendingRewards,
          };

          await db.insert(stakingSnapshot).values(userSnapshot);
        }
      }

      // Snapshot global del vault (sin reward account específico)
      // Útil para métricas generales del vault
      const globalVaultSnapshot: StakingSnapshotInsert = {
        snapshotType: "global_vault",
        vaultAddress: vault.address,
        snapshotTime: currentBlock.datetime,
        height: currentHeight,
        totalStaked: totalStaked.toString(),
        totalStakers,
        totalRewardsDistributed: "0", // No aplica sin reward account específico
        rewardsPerToken: "0",
      };

      await db.insert(stakingSnapshot).values(globalVaultSnapshot);
    }

    console.log(`Staking snapshots created successfully for ${vaults.length} vaults`);
  } catch (error) {
    console.error("Error creating staking snapshots:", error);
    throw error;
  }
}

