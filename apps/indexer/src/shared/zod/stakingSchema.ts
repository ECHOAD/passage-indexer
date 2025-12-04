import { z } from "zod";

// Vault Factory Schemas
export const VaultFactoryInstantiateSchema = z.object({
  vault_code_id: z.number(),
  rewards_code_id: z.number(),
});

export const VaultFactoryCreateVaultSchema = z.object({
  create_vault: z.object({
    vault_label: z.string(),
    collections: z.array(z.string()),
    unstaking_duration_sec: z.number(),
  }),
});

// NFT Vault Schemas
export const NftVaultInstantiateSchema = z.object({
  config: z.object({
    rewards_code_id: z.number(),
    collections: z.array(z.string()),
    unstaking_duration_sec: z.number(),
  }),
});

export const NftVaultStakeSchema = z.object({
  stake: z.object({
    nfts: z.array(
      z.object({
        collection: z.string(),
        token_id: z.string(),
      })
    ),
  }),
});

export const NftVaultUnstakeSchema = z.object({
  unstake: z.object({
    nfts: z.array(
      z.object({
        collection: z.string(),
        token_id: z.string(),
      })
    ),
  }),
});

export const NftVaultClaimSchema = z.object({
  claim: z.object({
    recipient: z.string().optional(),
  }).optional(),
});

export const NftVaultClaimRewardsSchema = z.object({
  claim_rewards: z.object({
    recipient: z.string().optional(),
  }).optional(),
});

export const NftVaultCreateRewardAccountSchema = z.object({
  create_reward_account: z.object({
    label: z.string(),
    reward_asset: z.union([
      z.object({
        native: z.string(),
      }),
      z.object({
        cw20: z.string(),
      }),
    ]),
    period_start: z.string(), // Timestamp as string
    duration_sec: z.number(),
  }),
});

// Stake Rewards Schemas
export const StakeRewardsInstantiateSchema = z.object({
  stake: z.string(),
  reward_asset: z.union([
    z.object({
      native: z.string(),
    }),
    z.object({
      cw20: z.string(),
    }),
  ]),
  period_start: z.string(), // Timestamp as string
  duration_sec: z.number(),
});

export const StakeRewardsStakeChangeSchema = z.object({
  stake_change: z.object({
    recipient: z.string(),
    staked_amount: z.string(),
    total_staked: z.string(),
  }),
});

export const StakeRewardsClaimRewardsSchema = z.object({
  claim_rewards: z.object({
    recipient: z.string(),
    staked_amount: z.string(),
    total_staked: z.string(),
  }),
});

// Type exports
export type VaultFactoryInstantiateTx = z.infer<typeof VaultFactoryInstantiateSchema>;
export type VaultFactoryCreateVaultTx = z.infer<typeof VaultFactoryCreateVaultSchema>;
export type NftVaultInstantiateTx = z.infer<typeof NftVaultInstantiateSchema>;
export type NftVaultStakeTx = z.infer<typeof NftVaultStakeSchema>;
export type NftVaultUnstakeTx = z.infer<typeof NftVaultUnstakeSchema>;
export type NftVaultClaimTx = z.infer<typeof NftVaultClaimSchema>;
export type NftVaultClaimRewardsTx = z.infer<typeof NftVaultClaimRewardsSchema>;
export type NftVaultCreateRewardAccountTx = z.infer<typeof NftVaultCreateRewardAccountSchema>;
export type StakeRewardsInstantiateTx = z.infer<typeof StakeRewardsInstantiateSchema>;
export type StakeRewardsStakeChangeTx = z.infer<typeof StakeRewardsStakeChangeSchema>;
export type StakeRewardsClaimRewardsTx = z.infer<typeof StakeRewardsClaimRewardsSchema>;

