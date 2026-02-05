// routes.ts
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getNftsWithStats, nftSortOptions, getRecentNftSales } from "@src/services/nft.service";

const maxLimit = 100;

const listNftsRoute = createRoute({
  method: "get",
  path: "/nfts",
  summary: "Get a list of NFTs.",
  request: {
    query: z.object({
      skip: z.string().optional().default("0"),
      limit: z.string().optional().default(String(maxLimit)),
      saleType: z.string().optional().openapi({ enum: ["LIVE_AUCTION", "FIXED_PRICE", "NOT_FOR_SALE"] }),
      sort: z.string().optional().openapi({ enum: nftSortOptions }),
      period: z.string().optional().openapi({ enum: ["24h", "7d", "30d"], description: "Stats period" })
    })
  },
  responses: {
    200: {
      description: "List of NFTs",
      content: {
        "application/json": {
          schema: z.object({
            nfts: z.array(
                z.object({
                  tokenId: z.string(),
                  owner: z.string(),
                  collection: z.object({ address: z.string(), name: z.string() }),
                  metadata: z.unknown({ description: "JSON Metadata" }),
                  createdOnBlockHeight: z.number(),
                  mintedOnBlockHeight: z.number(),
                  mintPrice: z.number().nullable(),
                  mintDenom: z.string().nullable(),
                  saleType: z.enum(["LIVE_AUCTION", "FIXED_PRICE", "NOT_FOR_SALE"]),
                  listedPrice: z.number().nullable(),
                  listedRawTokenId: z.string().nullable(),
                  listedDenom: z.string().nullable(),
                  totalSales: z.number(),
                  salesInPeriod: z.number(),
                  salesChangePct: z.number().nullable(),
                  lastSaleBlockHeight: z.number().nullable(),
                  lastSaleAt: z.string().datetime().nullable(),
                  lastSalePrice: z.number().nullable(),
                  lastSaleDenom: z.string().nullable()
                })
            ),
            pagination: z.object({ total: z.number() })
          })
        }
      }
    },
    400: {
      description: "Invalid parameter",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string()
          })
        }
      }
    }
  }
});

const recentSalesRoute = createRoute({
  method: "get",
  path: "/nfts/recent-sales",
  summary: "Get recent NFT sales.",
  request: {
    query: z.object({
      skip: z.string().optional().default("0"),
      limit: z.string().optional().default("10"),
      collectionAddress: z.string().optional()
    })
  },
  responses: {
    200: {
      description: "Recent sales",
      content: {
        "application/json": {
          schema: z.object({
            sales: z.array(
                z.object({
                  saleBlockHeight: z.number(),
                  saleAt: z.string().datetime(),
                  salePrice: z.number(),
                  saleDenom: z.string(),
                  nft: z.object({
                    id: z.string(),
                    tokenId: z.string(),
                    owner: z.string(),
                    collection: z.object({ address: z.string(), name: z.string() }),
                    metadata: z.unknown({ description: "JSON Metadata" })
                  })
                })
            )
          })
        }
      }
    },
    400: {
      description: "Bad Request",
      content: {
        "application/json": {
          schema: z.object({
            error: z.string()
          })
        }
      }
    }
  }
});

const app = new OpenAPIHono();

app.openapi(listNftsRoute, async (c) => {
  const rawSkip = parseInt(c.req.valid("query").skip ?? "0", 10);
  const rawLimit = parseInt(c.req.valid("query").limit ?? String(maxLimit), 10);
  const skip = Number.isFinite(rawSkip) && rawSkip >= 0 ? rawSkip : 0;
  const limit = Math.min(maxLimit, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : maxLimit);
  const saleType = c.req.valid("query").saleType;
  const sort = c.req.valid("query").sort;
  const period = (c.req.valid("query").period as "24h" | "7d" | "30d") ?? "7d";

  if (sort && !nftSortOptions.includes(sort)) {
    return c.json({ error: "Invalid sort option, valid options are: " + nftSortOptions.join(",") }, 400);
  }

  const { nfts, totalCount } = await getNftsWithStats({ saleType, sort, skip, limit, period });

  return c.json({
    nfts: nfts.map((n) => ({
      tokenId: n.tokenId,
      owner: n.owner,
      collection: { address: n.collectionAddress, name: n.collectionName },
      metadata: n.metadata,
      createdOnBlockHeight: n.createdOnBlockHeight,
      mintedOnBlockHeight: n.mintedOnBlockHeight,
      mintPrice: n.mintPrice ?? null,
      mintDenom: n.mintDenom ?? null,
      saleType: n.hasActiveAuction ? "LIVE_AUCTION" : n.forSalePrice ? "FIXED_PRICE" : "NOT_FOR_SALE",
      listedPrice: n.forSalePrice ?? null,
      listedRawTokenId: n.forSaleRawTokenId ?? null,
      listedDenom: n.forSaleDenom ?? null,
      totalSales: Number(n.totalSales ?? 0),
      salesInPeriod: Number(n.salesInPeriod ?? 0),
      salesChangePct: n.salesChangePct ?? null,
      lastSaleBlockHeight: n.lastSaleBlockHeight ?? null,
      lastSaleAt: n.lastSaleAt ? new Date(n.lastSaleAt).toISOString() : null,
      lastSalePrice: n.lastSalePrice ?? null,
      lastSaleDenom: n.lastSaleDenom ?? null
    })),
    pagination: { total: totalCount }
  });
});

app.openapi(recentSalesRoute, async (c) => {
  const rawSkip = parseInt(c.req.valid("query").skip ?? "0", 10);
  const rawLimit = parseInt(c.req.valid("query").limit ?? "10", 10);
  const skip = Number.isFinite(rawSkip) && rawSkip >= 0 ? rawSkip : 0;
  const limit = Math.min(maxLimit, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10);
  const collectionAddress = c.req.valid("query").collectionAddress;

  const {items, pagination} = await getRecentNftSales({ skip, limit, collectionAddress });

  return c.json({
    sales: items.map((r) => ({
      saleBlockHeight: r.saleBlockHeight,
      saleAt: new Date(r.saleAt).toISOString(),
      salePrice: r.salePrice,
      saleDenom: r.saleDenom,
      nft: {
        id: r.nft.id,
        tokenId: r.nft.tokenId,
        owner: r.nft.owner,
        collection: { address: r.nft.collection.address, name: r.nft.collection.name },
        metadata: r.nft.metadata
      }
    })),
    pagination
  });
});

export default app;
