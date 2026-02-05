import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getNftsWithStats, nftSortOptions } from "@src/services/nft.service";
import { OpenAPI_ExampleCollection } from "@src/utils/constants";
import { db, eq } from "database";
import {getFloorPrice} from "@src/services/collection.service";

const maxLimit = 100;

const route = createRoute({
  method: "get",
  path: "/collections/{address}/nfts",
  summary: "Get a list of NFTs in a collection.",
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "Collection Address",
        example: OpenAPI_ExampleCollection
      })
    }),
    query: z.object({
      skip: z.string().optional().default("0").openapi({ description: "NFTs to skip" }),
      limit: z.string().optional().default(maxLimit.toString()).openapi({ description: "NFTs to return", maximum: maxLimit }),
      saleType: z
          .string()
          .optional()
          .openapi({
            description: "Filter by sale type",
            enum: ["LIVE_AUCTION", "FIXED_PRICE", "NOT_FOR_SALE"]
          }),
      sort: z.string().optional().openapi({
        description: "Sort order",
        enum: nftSortOptions
      }),
      period: z.string().optional().openapi({ enum: ["24h", "7d", "30d"], description: "Stats period" }),
      minPrice: z.string().optional().openapi({ description: "Filter by min price" }),
      maxPrice: z.string().optional().openapi({ description: "Filter by max price" }),
      traits: z.union([z.string(), z.array(z.string())]).optional().openapi({
        description:
            "Repeatable. Format 'traitType:value'. i.e: traits=Background:Blue&traits=Background:Red&traits=Eyes:Laser"
      })
    })
  },
  responses: {
    404: {
      description: "Collection not found",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() })
        }
      }
    },
    400: {
      description: "Invalid parameter",
      content: {
        "application/json": {
          schema: z.object({ error: z.string() })
        }
      }
    },
    200: {
      description: "List of nfts",
      content: {
        "application/json": {
          schema: z.object({
            nfts: z.array(
                z.object({
                  tokenId: z.string(),
                  owner: z.string(),
                  metadata: z.unknown({ description: "JSON Metadata" }),
                  createdOnBlockHeight: z.number(),
                  mintedOnBlockHeight: z.number(),
                  mintPrice: z.number().nullable(),
                  mintDenom: z.string().nullable(),
                  saleType: z.enum(["LIVE_AUCTION", "FIXED_PRICE", "NOT_FOR_SALE"]),
                  listedRawTokenId: z.string().nullable(),
                  listedPrice: z.number().nullable(),
                  listedDenom: z.string().nullable(),
                  totalSales: z.number(),
                  salesInPeriod: z.number(),
                  salesChangePct: z.number().nullable(),
                  lastSaleBlockHeight: z.number().nullable(),
                  lastSaleAt: z.string().datetime().nullable(),
                  lastSalePrice: z.number().nullable(),
                  lastSaleDenom: z.string().nullable(),
                })
            ),
            pagination: z.object({
              total: z.number()
            })
          })
        }
      }
    }
  }
});

export default new OpenAPIHono().openapi(route, async (c) => {
  const collectionAddress = c.req.valid("param").address;

  const rawSkip = parseInt(c.req.valid("query").skip ?? "0", 10);
  const rawLimit = parseInt(c.req.valid("query").limit ?? String(maxLimit), 10);
  const skip = Number.isFinite(rawSkip) && rawSkip >= 0 ? rawSkip : 0;
  const limit = Math.min(maxLimit, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : maxLimit);

  const saleType = c.req.valid("query").saleType;
  const sort = c.req.valid("query").sort;
  const period = (c.req.valid("query").period as "24h" | "7d" | "30d") ?? "7d";

  const minPriceStr = c.req.valid("query").minPrice;
  const maxPriceStr = c.req.valid("query").maxPrice;
  const minPrice = minPriceStr != null ? Math.max(0, parseInt(minPriceStr, 10)) : undefined;
  const maxPrice = maxPriceStr != null ? Math.max(0, parseInt(maxPriceStr, 10)) : undefined;

  const traitsRaw = c.req.valid("query").traits;
  const traitsPairs =
      traitsRaw == null
          ? []
          : (Array.isArray(traitsRaw) ? traitsRaw : [traitsRaw])
              .map((s) => s.trim())
              .filter(Boolean)
              .map((s) => {
                const sep = s.indexOf(":");
                if (sep === -1) return null;
                const trait_type = s.slice(0, sep).trim();
                const trait_value = s.slice(sep + 1).trim();
                if (!trait_type || !trait_value) return null;
                return { trait_type, trait_value };
              })
              .filter((x): x is { trait_type: string; trait_value: string } => !!x);

  if (sort && !nftSortOptions.includes(sort)) {
    return c.json({ error: "Invalid sort option, valid options are: " + nftSortOptions.join(",") }, 400);
  }

  const collection = await db.query.collection.findFirst({
    where: (table) => eq(table.address, collectionAddress)
  });

  if (!collection) {
    return c.json({ error: "Collection not found" }, 404);
  }

  const { nfts, totalCount } = await getNftsWithStats({
    collectionAddress,
    saleType,
    sort,
    skip,
    limit,
    minPrice,
    maxPrice,
    traits: traitsPairs,
    period
  });

  return c.json({
    nfts: nfts.map((n) => ({
      tokenId: n.tokenId,
      owner: n.owner,
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
      lastSaleDenom: n.lastSaleDenom ?? null,
    })),
    pagination: {
      total: totalCount
    }
  });
});
