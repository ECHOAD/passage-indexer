import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { StakingService } from "@src/services/staking.service";

const stakingService = new StakingService();

// Schema para un vault de staking
const vaultSchema = z.object({
  id: z.string().openapi({ description: "Vault UUID", example: "550e8400-e29b-41d4-a716-446655440000" }),
  address: z.string().openapi({ description: "Vault contract address", example: "passage1vault..." }),
  factoryAddress: z.string().openapi({ description: "Factory contract that created this vault", example: "passage1factory..." }),
  createdHeight: z.number().openapi({ description: "Block height when vault was created", example: 1234567 }),
  createdBy: z.string().openapi({ description: "Address of the vault creator", example: "passage1..." }),
  unstakingDurationSec: z.number().openapi({ description: "Unstaking duration in seconds (e.g., 604800 = 7 days)", example: 604800 }),
  collections: z.array(z.string()).openapi({ description: "Array of allowed collection contract addresses" }),
  createdAt: z.string().openapi({ description: "Timestamp when vault was created (ISO 8601)", example: "2024-01-15T10:30:00Z" }),
  rewardAccounts: z.array(z.object({
    id: z.string(),
    address: z.string(),
    rewardAssetType: z.enum(["native", "cw20"]),
    rewardAssetDenom: z.string(),
    periodStart: z.string(),
    durationSec: z.number(),
    periodEnd: z.string(),
    totalFunds: z.string(),
    remainingFunds: z.string(),
  })).optional().openapi({ description: "Associated reward accounts for this vault" }),
});

const getVaultsRoute = createRoute({
  method: "get",
  path: "/vaults",
  summary: "Get all staking vaults",
  description: "Retrieve all staking vaults or filter by a specific vault address. Returns vault configuration including allowed collections, unstaking duration, and reward accounts.",
  tags: ["Staking - Vaults"],
  request: {
    query: z.object({
      address: z.string().optional().openapi({
        description: "Filter to get a specific vault by address. If provided, returns a single vault object instead of an array.",
        example: "passage1vault...",
      }),
    }),
  },
  responses: {
    200: {
      description: "Successfully retrieved vault(s). Returns either a single vault object (when filtering by address) or an array of all vaults.",
      content: {
        "application/json": {
          schema: z.union([vaultSchema, z.array(vaultSchema)]),
        },
      },
    },
  },
});

const getVaultByIdRoute = createRoute({
  method: "get",
  path: "/vaults/{address}",
  summary: "Get vault by address",
  description: "Retrieve detailed information about a specific staking vault including all associated reward accounts. This endpoint provides complete vault configuration and reward distribution details.",
  tags: ["Staking - Vaults"],
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "Vault contract address",
        example: "passage1vault...",
      }),
    }),
  },
  responses: {
    200: {
      description: "Successfully retrieved vault details with all reward accounts",
      content: {
        "application/json": {
          schema: vaultSchema.extend({
            rewardAccounts: z.array(
              z.object({
                id: z.string().openapi({ description: "Reward account UUID" }),
                address: z.string().openapi({ description: "Reward account contract address" }),
                vaultAddress: z.string().openapi({ description: "Parent vault address" }),
                rewardAssetType: z.enum(["native", "cw20"]).openapi({ description: "Type of reward asset: native token or CW20 token" }),
                rewardAssetDenom: z.string().openapi({ description: "Denomination or contract address of the reward asset", example: "upasg" }),
                periodStart: z.string().openapi({ description: "Start timestamp of reward period (ISO 8601)" }),
                durationSec: z.number().openapi({ description: "Duration of reward period in seconds", example: 2592000 }),
                periodEnd: z.string().openapi({ description: "End timestamp of reward period (ISO 8601)" }),
                totalFunds: z.string().openapi({ description: "Total funds allocated for rewards", example: "1000000000" }),
                remainingFunds: z.string().openapi({ description: "Remaining funds available for distribution", example: "500000000" }),
                createdAt: z.string().openapi({ description: "Timestamp when reward account was created" }),
              })
            ),
          }),
        },
      },
    },
    404: {
      description: "Vault not found - the specified address does not correspond to any known vault",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string().openapi({ example: "Vault not found" }),
          }),
        },
      },
    },
  },
});

export default new OpenAPIHono()
  .openapi(getVaultsRoute, async (c) => {
    const { address } = c.req.valid("query");
    const vaults = await stakingService.getVaults(address);
    return c.json(vaults, 200);
  })
  .openapi(getVaultByIdRoute, async (c) => {
    const address = c.req.param("address");
    const vault = await stakingService.getVaults(address);

    if (!vault) {
      return c.json({ error: "Vault not found" }, 404);
    }

    return c.json(vault, 200);
  });

