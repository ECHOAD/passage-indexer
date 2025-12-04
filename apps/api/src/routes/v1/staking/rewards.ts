import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { StakingService } from "@src/services/staking.service";

const stakingService = new StakingService();

const getPendingRewardsRoute = createRoute({
  method: "get",
  path: "/users/{address}/rewards/pending",
  summary: "Get pending rewards for a user",
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "User address",
        example: "passage1...",
      }),
    }),
    query: z.object({
      vaultAddress: z.string().optional(),
      rewardAccountAddress: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Pending rewards",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              rewardAccountAddress: z.string(),
              pendingRewards: z.string().nullable(),
              rewardAssetDenom: z.string(),
              rewardAssetType: z.enum(["native", "cw20"]),
            })
          ),
        },
      },
    },
  },
});

const getRewardHistoryRoute = createRoute({
  method: "get",
  path: "/users/{address}/rewards/history",
  summary: "Get reward claim history for a user",
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "User address",
      }),
    }),
    query: z.object({
      vaultAddress: z.string().optional(),
      rewardAccountAddress: z.string().optional(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      limit: z.coerce.number().optional().default(50),
      offset: z.coerce.number().optional().default(0),
    }),
  },
  responses: {
    200: {
      description: "Reward claim history",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: z.string(),
              rewardAccountAddress: z.string(),
              vaultAddress: z.string(),
              userAddress: z.string(),
              claimedAtHeight: z.number(),
              claimedAt: z.string(),
              amount: z.string(),
              denom: z.string(),
              stakedAmount: z.string(),
              totalStaked: z.string(),
              rewardsPerToken: z.string(),
            })
          ),
        },
      },
    },
  },
});

const getVaultRewardsSummaryRoute = createRoute({
  method: "get",
  path: "/vaults/{vaultAddress}/rewards/summary",
  summary: "Get rewards summary for a vault",
  request: {
    params: z.object({
      vaultAddress: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Rewards summary",
      content: {
        "application/json": {
          schema: z.object({
            rewardAccounts: z.array(
              z.object({
                address: z.string(),
                rewardAssetType: z.enum(["native", "cw20"]),
                rewardAssetDenom: z.string(),
                totalFunds: z.string(),
                remainingFunds: z.string(),
                totalDistributed: z.string(),
              })
            ),
            totalDistributed: z.string(),
          }),
        },
      },
    },
  },
});

export default new OpenAPIHono()
  .openapi(getPendingRewardsRoute, async (c) => {
    const { address } = c.req.valid("params");
    const { vaultAddress, rewardAccountAddress } = c.req.valid("query");

    const rewards = await stakingService.getPendingRewards(address, vaultAddress, rewardAccountAddress);

    return c.json(rewards, 200);
  })
  .openapi(getRewardHistoryRoute, async (c) => {
    const { address } = c.req.valid("params");
    const { vaultAddress, rewardAccountAddress, fromDate, toDate, limit, offset } = c.req.valid("query");

    const history = await stakingService.getRewardHistory(address, {
      vaultAddress,
      rewardAccountAddress,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      limit,
      offset,
    });

    return c.json(history, 200);
  })
  .openapi(getVaultRewardsSummaryRoute, async (c) => {
    const { vaultAddress } = c.req.valid("params");

    const rewardAccounts = await stakingService.getRewardAccounts(vaultAddress);
    const stats = await stakingService.getVaultStats(vaultAddress);

    return c.json(
      {
        rewardAccounts: rewardAccounts.map((ra) => ({
          address: ra.address,
          rewardAssetType: ra.rewardAssetType,
          rewardAssetDenom: ra.rewardAssetDenom,
          totalFunds: ra.totalFunds,
          remainingFunds: ra.remainingFunds,
          totalDistributed: stats.totalRewardsDistributed.find((r) => r.denom === ra.rewardAssetDenom)?.total || "0",
        })),
        totalDistributed: stats.totalRewardsDistributed.reduce((sum, r) => sum + parseFloat(r.total || "0"), 0).toString(),
      },
      200
    );
  });

