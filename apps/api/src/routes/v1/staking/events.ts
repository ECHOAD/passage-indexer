import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { StakingService } from "@src/services/staking.service";

const stakingService = new StakingService();

const getUserEventsRoute = createRoute({
  method: "get",
  path: "/users/{address}/events",
  summary: "Get staking events for a user",
  request: {
    params: z.object({
      address: z.string(),
    }),
    query: z.object({
      vaultAddress: z.string().optional(),
      eventType: z.enum(["stake", "unstake", "claim", "claim_rewards", "create_reward_account"]).optional(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      limit: z.coerce.number().optional().default(50),
      offset: z.coerce.number().optional().default(0),
    }),
  },
  responses: {
    200: {
      description: "Staking events",
      content: {
        "application/json": {
          schema: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                vaultAddress: z.string(),
                eventType: z.enum(["stake", "unstake", "claim", "claim_rewards", "create_reward_account"]),
                userAddress: z.string(),
                height: z.number(),
                transactionHash: z.string(),
                blockTime: z.string(),
                nftCount: z.number().nullable(),
                rewardAccountAddress: z.string().nullable(),
                rewardAmount: z.string().nullable(),
                rewardDenom: z.string().nullable(),
                metadata: z.record(z.any()).nullable(),
              })
            ),
            total: z.number(),
          }),
        },
      },
    },
  },
});

const getVaultEventsRoute = createRoute({
  method: "get",
  path: "/vaults/{vaultAddress}/events",
  summary: "Get staking events for a vault",
  request: {
    params: z.object({
      vaultAddress: z.string(),
    }),
    query: z.object({
      userAddress: z.string().optional(),
      eventType: z.enum(["stake", "unstake", "claim", "claim_rewards", "create_reward_account"]).optional(),
      fromDate: z.string().datetime().optional(),
      toDate: z.string().datetime().optional(),
      limit: z.coerce.number().optional().default(50),
      offset: z.coerce.number().optional().default(0),
    }),
  },
  responses: {
    200: {
      description: "Staking events",
      content: {
        "application/json": {
          schema: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                vaultAddress: z.string(),
                eventType: z.enum(["stake", "unstake", "claim", "claim_rewards", "create_reward_account"]),
                userAddress: z.string(),
                height: z.number(),
                transactionHash: z.string(),
                blockTime: z.string(),
                nftCount: z.number().nullable(),
                rewardAccountAddress: z.string().nullable(),
                rewardAmount: z.string().nullable(),
                rewardDenom: z.string().nullable(),
                metadata: z.record(z.any()).nullable(),
              })
            ),
            total: z.number(),
          }),
        },
      },
    },
  },
});

export default new OpenAPIHono()
  .openapi(getUserEventsRoute, async (c) => {
    const { address } = c.req.valid("params");
    const { vaultAddress, eventType, fromDate, toDate, limit, offset } = c.req.valid("query");

    const events = await stakingService.getStakingEvents({
      userAddress: address,
      vaultAddress,
      eventType,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      limit,
      offset,
    });

    // Contar total para paginación
    const allEvents = await stakingService.getStakingEvents({
      userAddress: address,
      vaultAddress,
      eventType,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    });

    return c.json(
      {
        items: events,
        total: allEvents.length,
      },
      200
    );
  })
  .openapi(getVaultEventsRoute, async (c) => {
    const { vaultAddress } = c.req.valid("params");
    const { userAddress, eventType, fromDate, toDate, limit, offset } = c.req.valid("query");

    const events = await stakingService.getStakingEvents({
      vaultAddress,
      userAddress,
      eventType,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      limit,
      offset,
    });

    // Contar total para paginación
    const allEvents = await stakingService.getStakingEvents({
      vaultAddress,
      userAddress,
      eventType,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    });

    return c.json(
      {
        items: events,
        total: allEvents.length,
      },
      200
    );
  });

