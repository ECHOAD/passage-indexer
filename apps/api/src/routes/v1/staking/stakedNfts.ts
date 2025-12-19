import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { StakingService } from "@src/services/staking.service";

const stakingService = new StakingService();

// Schema para la colección del NFT
const collectionSchema = z.object({
  id: z.string().openapi({ description: "Collection UUID", example: "550e8400-e29b-41d4-a716-446655440000" }),
  address: z.string().openapi({ description: "Collection contract address", example: "passage1..." }),
  name: z.string().nullable().openapi({ description: "Collection name", example: "My NFT Collection" }),
  symbol: z.string().nullable().openapi({ description: "Collection symbol", example: "MNFT" }),
  description: z.string().nullable().openapi({ description: "Collection description" }),
  image: z.string().nullable().openapi({ description: "Collection image URL", example: "ipfs://..." }),
});

// Schema para la información completa del NFT
const nftSchema = z.object({
  id: z.string().openapi({ description: "NFT UUID", example: "550e8400-e29b-41d4-a716-446655440000" }),
  tokenId: z.number().openapi({ description: "Token ID number", example: 1 }),
  owner: z.string().nullable().openapi({ description: "Current owner address", example: "passage1..." }),
  name: z.string().nullable().openapi({ description: "NFT name", example: "Cool NFT #1" }),
  description: z.string().nullable().openapi({ description: "NFT description" }),
  image: z.string().nullable().openapi({ description: "NFT image URL", example: "ipfs://QmX..." }),
  externalUrl: z.string().nullable().openapi({ description: "External URL for the NFT" }),
  backgroundColor: z.string().nullable().openapi({ description: "Background color in hex", example: "#FFFFFF" }),
  animationUrl: z.string().nullable().openapi({ description: "Animation URL for animated NFTs" }),
  youtubeUrl: z.string().nullable().openapi({ description: "YouTube video URL" }),
  metadata: z.record(z.any()).openapi({ description: "Complete NFT metadata object" }),
  collectionAddress: z.string().openapi({ description: "Collection contract address" }),
  collection: collectionSchema.nullable().openapi({ description: "Collection information" }),
});

const vaultSchema = z.object({
  id: z.string().openapi({ description: "Vault UUID" }),
  address: z.string().openapi({ description: "Vault contract address", example: "passage1..." }),
  factoryAddress: z.string().openapi({ description: "Factory contract address" }),
  unstakingDurationSec: z.number().openapi({ description: "Unstaking duration in seconds", example: 604800 }),
  collections: z.array(z.string()).openapi({ description: "List of allowed collection addresses" }),
});

const stakedNftSchema = z.object({
  id: z.string().openapi({ description: "Staked NFT record UUID" }),
  vaultAddress: z.string().openapi({ description: "Vault contract address where NFT is staked" }),
  collectionAddress: z.string().openapi({ description: "Collection contract address" }),
  tokenId: z.string().openapi({ description: "Token ID as string", example: "1" }),
  stakerAddress: z.string().openapi({ description: "Address of the user who staked the NFT", example: "passage1..." }),
  stakedAtHeight: z.number().openapi({ description: "Block height when NFT was staked", example: 1234567 }),
  stakedAt: z.string().openapi({ description: "Timestamp when NFT was staked (ISO 8601)", example: "2024-01-15T10:30:00Z" }),
  unstakedAtHeight: z.number().nullable().openapi({ description: "Block height when NFT was unstaked (null if still staked)" }),
  unstakedAt: z.string().nullable().openapi({ description: "Timestamp when NFT was unstaked (null if still staked)" }),
  claimableAt: z.string().nullable().openapi({ description: "Timestamp when NFT becomes claimable after unstaking" }),
  isClaimed: z.boolean().openapi({ description: "Whether the NFT has been claimed after unstaking", example: false }),
  nftId: z.string().nullable().openapi({ description: "Reference to the NFT record UUID" }),
  nft: nftSchema.nullable().openapi({ description: "Complete NFT information including metadata" }),
  vault: vaultSchema.nullable().openapi({ description: "Vault information" }),
  collection: collectionSchema.nullable().openapi({ description: "Collection information" }),
});

const getStakedNftsByUserRoute = createRoute({
  method: "get",
  path: "/users/{address}/staked-nfts",
  summary: "Get staked NFTs by user",
  description: "Retrieve all NFTs currently staked by a specific user address. Returns complete NFT information including metadata, collection details, and vault information. NFTs that have been unstaked are not included in the results.",
  tags: ["Staking - NFTs"],
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "User wallet address",
        example: "passage1xtmhdvyw8yk8wr5aavt0klgrxuz2x5ktw8j75s",
      }),
    }),
    query: z.object({
      vaultAddress: z.string().optional().openapi({
        description: "Filter results to only show NFTs staked in a specific vault",
        example: "passage1vault...",
      }),
      collectionAddress: z.string().optional().openapi({
        description: "Filter results to only show NFTs from a specific collection",
        example: "passage1collection...",
      }),
    }),
  },
  responses: {
    200: {
      description: "Successfully retrieved staked NFTs. Returns an array with complete NFT information including metadata, images, owner, and collection details.",
      content: {
        "application/json": {
          schema: z.array(stakedNftSchema),
        },
      },
    },
  },
});

const getStakedNftsByVaultRoute = createRoute({
  method: "get",
  path: "/vaults/{vaultAddress}/staked-nfts",
  summary: "Get all staked NFTs in a vault",
  description: "Retrieve all NFTs currently staked in a specific vault with pagination support. Returns complete NFT information including metadata, images, and collection details. Use limit and offset for pagination.",
  tags: ["Staking - NFTs"],
  request: {
    params: z.object({
      vaultAddress: z.string().openapi({
        description: "Vault contract address",
        example: "passage1vault...",
      }),
    }),
    query: z.object({
      collectionAddress: z.string().optional().openapi({
        description: "Filter results to only show NFTs from a specific collection",
        example: "passage1collection...",
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
      description: "Successfully retrieved paginated list of staked NFTs with complete information",
      content: {
        "application/json": {
          schema: z.object({
            items: z.array(stakedNftSchema).openapi({ description: "Array of staked NFTs with complete information" }),
            total: z.number().openapi({ description: "Total number of staked NFTs in the vault", example: 150 }),
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

