import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { StakingService } from "@src/services/staking.service";

const stakingService = new StakingService();

const getStakedNftsByUserRoute = createRoute({
  method: "get",
  path: "/users/{address}/staked-nfts",
  summary: "Get staked NFTs by user address",
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "User address",
        example: "passage1...",
      }),
    }),
    query: z.object({
      vaultAddress: z.string().optional().openapi({
        description: "Filter by vault address",
      }),
      collectionAddress: z.string().optional().openapi({
        description: "Filter by collection address",
      }),
    }),
  },
  responses: {
    200: {
      description: "List of staked NFTs",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              id: z.string(),
              vaultAddress: z.string(),
              collectionAddress: z.string(),
              tokenId: z.string(),
              stakerAddress: z.string(),
              stakedAtHeight: z.number(),
              stakedAt: z.string(),
              nftId: z.string().nullable(),
            })
          ),
        },
      },
    },
  },
});

const getStakedNftsByVaultRoute = createRoute({
  method: "get",
  path: "/vaults/{vaultAddress}/staked-nfts",
  summary: "Get all staked NFTs in a vault",
  request: {
    params: z.object({
      vaultAddress: z.string().openapi({
        description: "Vault address",
      }),
    }),
    query: z.object({
      collectionAddress: z.string().optional(),
      limit: z.coerce.number().optional().default(50),
      offset: z.coerce.number().optional().default(0),
    }),
  },
  responses: {
    200: {
      description: "List of staked NFTs",
      content: {
        "application/json": {
          schema: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                vaultAddress: z.string(),
                collectionAddress: z.string(),
                tokenId: z.string(),
                stakerAddress: z.string(),
                stakedAtHeight: z.number(),
                stakedAt: z.string(),
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
  .openapi(getStakedNftsByUserRoute, async (c) => {
    const { address } = c.req.valid("param");
    const { vaultAddress, collectionAddress } = c.req.valid("query");

    const stakedNfts = await stakingService.getStakedNftsByUser(address, {
      vaultAddress,
      collectionAddress,
    });

    return c.json(stakedNfts, 200);
  })
  .openapi(getStakedNftsByVaultRoute, async (c) => {
    const { vaultAddress } = c.req.valid("param");
    const { collectionAddress, limit, offset } = c.req.valid("query");

    const stakedNfts = await stakingService.getStakedNftsByVault(vaultAddress, {
      collectionAddress,
      limit,
      offset,
    });

    // Contar total para paginación
    const totalResult = await stakingService.getStakedNftsByVault(vaultAddress, {
      collectionAddress,
    });
    const total = Array.isArray(totalResult) ? totalResult.length : 0;

    return c.json(
      {
        items: stakedNfts,
        total,
      },
      200
    );
  });

