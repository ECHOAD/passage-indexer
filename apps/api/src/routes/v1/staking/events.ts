import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { StakingService } from "@src/services/staking.service";

const stakingService = new StakingService();

const stakingEventSchema = z.object({
  id: z.string().openapi({ description: "Event UUID" }),
  vaultAddress: z.string().openapi({ description: "Vault contract address where event occurred", example: "passage1vault..." }),
  eventType: z.enum(["stake", "unstake", "claim", "claim_rewards", "create_reward_account"]).openapi({
    description: "Type of staking event",
    example: "stake"
  }),
  userAddress: z.string().openapi({ description: "User address who triggered the event", example: "passage1..." }),
  height: z.number().openapi({ description: "Block height when event occurred", example: 1234567 }),
  transactionHash: z.string().openapi({ description: "Transaction hash", example: "ABC123..." }),
  blockTime: z.string().openapi({ description: "Timestamp of the event (ISO 8601)", example: "2024-01-15T10:30:00Z" }),
  nftCount: z.number().nullable().openapi({ description: "Number of NFTs involved in stake/unstake events", example: 5 }),
  rewardAccountAddress: z.string().nullable().openapi({ description: "Reward account address for claim events" }),
  rewardAmount: z.string().nullable().openapi({ description: "Amount of rewards claimed", example: "1000000" }),
  rewardDenom: z.string().nullable().openapi({ description: "Denomination of claimed rewards", example: "upasg" }),
  metadata: z.record(z.any()).nullable().openapi({ description: "Additional event metadata" }),
});

const getUserEventsRoute = createRoute({
  method: "get",
  path: "/users/{address}/events",
  summary: "Get staking events for a user",
  description: "Retrieve all staking-related events (stake, unstake, claim) for a specific user. Supports filtering by vault, event type, and date range. Results are paginated and sorted by most recent first.",
  tags: ["Staking - Events"],
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "User wallet address",
        example: "passage1xtmhdvyw8yk8wr5aavt0klgrxuz2x5ktw8j75s",
      }),
    }),
    query: z.object({
      vaultAddress: z.string().optional().openapi({
        description: "Filter events from a specific vault",
        example: "passage1vault...",
      }),
      eventType: z.enum(["stake", "unstake", "claim", "claim_rewards", "create_reward_account"]).optional().openapi({
        description: "Filter by event type",
      }),
      fromDate: z.string().datetime().optional().openapi({
        description: "Filter events from this date onwards (ISO 8601)",
        example: "2024-01-01T00:00:00Z",
      }),
      toDate: z.string().datetime().optional().openapi({
        description: "Filter events up to this date (ISO 8601)",
        example: "2024-12-31T23:59:59Z",
      }),
      limit: z.coerce.number().optional().default(50).openapi({
        description: "Maximum number of results to return",
        example: 50,
        default: 50,
      }),
      offset: z.coerce.number().optional().default(0).openapi({
        description: "Number of results to skip (for pagination)",
        example: 0,
        default: 0,
      }),
    }),
  },
  responses: {
    200: {
      description: "Successfully retrieved user staking events with pagination info",
      content: {
        "application/json": {
          schema: z.object({
            items: z.array(stakingEventSchema).openapi({ description: "Array of staking events" }),
            total: z.number().openapi({ description: "Total number of events matching the filters", example: 150 }),
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
  description: "Retrieve all staking-related events for a specific vault. Supports filtering by user, event type, and date range. Useful for tracking vault activity and generating reports.",
  tags: ["Staking - Events"],
  request: {
    params: z.object({
      vaultAddress: z.string().openapi({
        description: "Vault contract address",
        example: "passage1vault...",
      }),
    }),
    query: z.object({
      userAddress: z.string().optional().openapi({
        description: "Filter events by a specific user address",
        example: "passage1...",
      }),
      eventType: z.enum(["stake", "unstake", "claim", "claim_rewards", "create_reward_account"]).optional().openapi({
        description: "Filter by event type",
      }),
      fromDate: z.string().datetime().optional().openapi({
        description: "Filter events from this date onwards (ISO 8601)",
        example: "2024-01-01T00:00:00Z",
      }),
      toDate: z.string().datetime().optional().openapi({
        description: "Filter events up to this date (ISO 8601)",
        example: "2024-12-31T23:59:59Z",
      }),
      limit: z.coerce.number().optional().default(50).openapi({
        description: "Maximum number of results to return",
        example: 50,
        default: 50,
      }),
      offset: z.coerce.number().optional().default(0).openapi({
        description: "Number of results to skip (for pagination)",
        example: 0,
        default: 0,
      }),
    }),
  },
  responses: {
    200: {
      description: "Successfully retrieved vault staking events with pagination info",
      content: {
        "application/json": {
          schema: z.object({
            items: z.array(stakingEventSchema).openapi({ description: "Array of staking events" }),
            total: z.number().openapi({ description: "Total number of events matching the filters", example: 500 }),
          }),
        },
      },
    },
  },
});

export default new OpenAPIHono()
  .openapi(getUserEventsRoute, async (c) => {
    const params = c.req.valid("param");
    const query = c.req.valid("query");
    const address = params.address;
    const { vaultAddress, eventType, fromDate, toDate, limit, offset } = query;

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
    const params = c.req.valid("param");
    const query = c.req.valid("query");
    const vaultAddress = params.vaultAddress;
    const { userAddress, eventType, fromDate, toDate, limit, offset } = query;

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

