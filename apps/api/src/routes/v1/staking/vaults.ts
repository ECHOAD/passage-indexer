import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { StakingService } from "@src/services/staking.service";

const stakingService = new StakingService();

const getVaultsRoute = createRoute({
  method: "get",
  path: "/vaults",
  summary: "Get all staking vaults",
  request: {
    query: z.object({
      address: z.string().optional().openapi({
        description: "Filter by vault address",
        example: "passage1...",
      }),
    }),
  },
  responses: {
    200: {
      description: "List of vaults",
      content: {
        "application/json": {
          schema: z.union([
            z.object({
              id: z.string(),
              address: z.string(),
              factoryAddress: z.string(),
              createdHeight: z.number(),
              createdBy: z.string(),
              unstakingDurationSec: z.string(),
              collections: z.array(z.string()),
              createdAt: z.string(),
            }),
            z.array(
              z.object({
                id: z.string(),
                address: z.string(),
                factoryAddress: z.string(),
                createdHeight: z.number(),
                createdBy: z.string(),
                unstakingDurationSec: z.string(),
                collections: z.array(z.string()),
                createdAt: z.string(),
              })
            ),
          ]),
        },
      },
    },
  },
});

const getVaultByIdRoute = createRoute({
  method: "get",
  path: "/vaults/{address}",
  summary: "Get vault by address",
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "Vault address",
        example: "passage1...",
      }),
    }),
  },
  responses: {
    200: {
      description: "Vault details",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            address: z.string(),
            factoryAddress: z.string(),
            createdHeight: z.number(),
            createdBy: z.string(),
            unstakingDurationSec: z.string(),
            collections: z.array(z.string()),
            createdAt: z.string(),
            rewardAccounts: z.array(
              z.object({
                id: z.string(),
                address: z.string(),
                vaultAddress: z.string(),
                rewardAssetType: z.enum(["native", "cw20"]),
                rewardAssetDenom: z.string(),
                periodStart: z.string(),
                durationSec: z.string(),
                periodEnd: z.string(),
                totalFunds: z.string(),
                remainingFunds: z.string(),
                createdAt: z.string(),
              })
            ),
          }),
        },
      },
    },
    404: {
      description: "Vault not found",
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
    const { address } = c.req.param("address");
    const vault = await stakingService.getVaults(address);

    if (!vault) {
      return c.json({ error: "Vault not found" }, 404);
    }

    return c.json(vault, 200);
  });

