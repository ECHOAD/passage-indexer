import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { StakingService } from "@src/services/staking.service";

const stakingService = new StakingService();

const getUserMetricsRoute = createRoute({
  method: "get",
  path: "/users/{address}/metrics",
  summary: "Get staking metrics for a user",
  request: {
    params: z.object({
      address: z.string(),
    }),
    query: z.object({
      vaultAddress: z.string().optional(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      groupBy: z.enum(["day", "week", "month"]).optional().default("day"),
    }),
  },
  responses: {
    200: {
      description: "User staking metrics",
      content: {
        "application/json": {
          schema: z.object({
            totalStakedNfts: z.number(),
            activeVaults: z.number(),
            collections: z.array(
              z.object({
                collectionAddress: z.string(),
                stakedCount: z.number(),
              })
            ),
            totalRewardsClaimed: z.array(
              z.object({
                total: z.string().nullable(),
                denom: z.string(),
              })
            ),
            metrics: z.array(
              z.object({
                period: z.string(),
                avgTotalStaked: z.number().nullable(),
                maxTotalStaked: z.number().nullable(),
                minTotalStaked: z.number().nullable(),
                avgTotalStakers: z.number().nullable(),
                totalRewardsDistributed: z.number().nullable(),
              })
            ),
          }),
        },
      },
    },
  },
});

const getVaultMetricsRoute = createRoute({
  method: "get",
  path: "/vaults/{vaultAddress}/metrics",
  summary: "Get metrics for a vault",
  request: {
    params: z.object({
      vaultAddress: z.string(),
    }),
    query: z.object({
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      groupBy: z.enum(["day", "week", "month"]).optional().default("day"),
      rewardAccountAddress: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: "Vault metrics",
      content: {
        "application/json": {
          schema: z.object({
            metrics: z.array(
              z.object({
                period: z.string(),
                avgTotalStaked: z.number().nullable(),
                maxTotalStaked: z.number().nullable(),
                minTotalStaked: z.number().nullable(),
                avgTotalStakers: z.number().nullable(),
                totalRewardsDistributed: z.number().nullable(),
              })
            ),
          }),
        },
      },
    },
  },
});

const getVaultStatsRoute = createRoute({
  method: "get",
  path: "/vaults/{vaultAddress}/stats",
  summary: "Get statistics for a vault",
  request: {
    params: z.object({
      vaultAddress: z.string(),
    }),
  },
  responses: {
    200: {
      description: "Vault statistics",
      content: {
        "application/json": {
          schema: z.object({
            totalStaked: z.number(),
            totalStakers: z.number(),
            collectionDistribution: z.array(
              z.object({
                collectionAddress: z.string(),
                stakedCount: z.number(),
              })
            ),
            rewardAccounts: z.number(),
            totalRewardsDistributed: z.array(
              z.object({
                total: z.string().nullable(),
                denom: z.string(),
              })
            ),
          }),
        },
      },
    },
  },
});

const getTopStakersRoute = createRoute({
  method: "get",
  path: "/vaults/{vaultAddress}/top-stakers",
  summary: "Get top stakers in a vault",
  request: {
    params: z.object({
      vaultAddress: z.string(),
    }),
    query: z.object({
      limit: z.coerce.number().optional().default(10),
    }),
  },
  responses: {
    200: {
      description: "Top stakers",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              stakerAddress: z.string(),
              stakedCount: z.number(),
            })
          ),
        },
      },
    },
  },
});

export default new OpenAPIHono()
  .openapi(getUserMetricsRoute, async (c) => {
    const { address } = c.req.valid("param");
    const { vaultAddress, fromDate, toDate, groupBy } = c.req.valid("query");

    const stats = await stakingService.getUserStakingStats(address);

    let metrics: any[] = [];
    if (vaultAddress) {
      metrics = await stakingService.getStakingMetrics(vaultAddress, {
        fromDate: fromDate ? new Date(fromDate) : undefined,
        toDate: toDate ? new Date(toDate) : undefined,
        groupBy: groupBy as "day" | "week" | "month",
        snapshotType: "user",
      });
    }

    return c.json(
      {
        ...stats,
        metrics,
      },
      200
    );
  })
  .openapi(getVaultMetricsRoute, async (c) => {
    const { vaultAddress } = c.req.valid("param");
    const { fromDate, toDate, groupBy, rewardAccountAddress } = c.req.valid("query");

    const metrics = await stakingService.getStakingMetrics(vaultAddress, {
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      groupBy: groupBy as "day" | "week" | "month",
      snapshotType: rewardAccountAddress ? "global_reward" : "global_vault",
      rewardAccountAddress,
    });

    return c.json({ metrics }, 200);
  })
  .openapi(getVaultStatsRoute, async (c) => {
    const { vaultAddress } = c.req.valid("param");
    const stats = await stakingService.getVaultStats(vaultAddress);
    return c.json(stats, 200);
  })
  .openapi(getTopStakersRoute, async (c) => {
    const { vaultAddress } = c.req.valid("param");
    const { limit } = c.req.valid("query");
    const topStakers = await stakingService.getTopStakers(vaultAddress, limit);
    return c.json(topStakers, 200);
  });

