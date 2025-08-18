import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getCollections, mintStatusKeys, sortOptionsKeys } from "@src/services/collection.service";

const maxLimit = 100;

const route = createRoute({
  method: "get",
  path: "/collections",
  summary: "Get a list of collections.",
  request: {
    query: z.object({
      skip: z.string().optional().default("0").openapi({ description: "Collections to skip" }),
      limit: z.string().optional().default(String(maxLimit)).openapi({ description: "Collections to return", maximum: maxLimit }),
      mintStatus: z.string().optional().default("ALL").openapi({ description: "Filter by mint status", enum: mintStatusKeys }),
      sort: z.string().optional().default("createdHeightAsc").openapi({ description: "Sort order", enum: sortOptionsKeys }),
      period: z.string().optional().default("7d").openapi({ description: "Stats period", enum: ["24h", "7d", "30d"] })
    })
  },
  responses: {
    200: {
      description: "List of collections",
      content: {
        "application/json": {
          schema: z.object({
            collections: z.array(
                z.object({
                  address: z.string(),
                  createdHeight: z.number(),
                  name: z.string(),
                  symbol: z.string(),
                  mintContract: z.string().nullable(),
                  marketContract: z.string().nullable(),
                  minter: z.string(),
                  creator: z.string(),
                  description: z.string(),
                  image: z.string(),
                  externalLink: z.string(),
                  royaltyAddress: z.string(),
                  royaltyFee: z.string(),
                  maxNumToken: z.number().nullable(),
                  perAddressLimit: z.number().nullable(),
                  startTime: z.string().nullable(),
                  unitPrice: z.string().nullable(),
                  unitDenom: z.string().nullable(),
                  nftCount: z.number(),
                  mintedNftCount: z.number(),
                  remainingMintCount: z.number(),
                  uniqueOwnerCount: z.number(),
                  floorPrice: z.string().nullable(),

                  totalSales: z.number(),
                  totalVolume: z.object({
                    upasg: z.string().nullable(),
                    usd: z.string().nullable()
                  }),
                  salesInPeriod: z.number(),
                  salesChangePct: z.number().nullable(),
                  volumeInPeriod: z.object({
                    upasg: z.string().nullable(),
                    upasgChangePct: z.number().nullable(),
                    usd: z.string().nullable(),
                    usdChangePct: z.number().nullable()
                  }),

                  totalMints: z.number(),
                  totalMintVolume: z.object({
                    upasg: z.string().nullable(),
                    usd: z.string().nullable()
                  }),
                  mintsInPeriod: z.number(),
                  mintsChangePct: z.number().nullable(),
                  mintVolumeInPeriod: z.object({
                    upasg: z.string().nullable(),
                    upasgChangePct: z.number().nullable(),
                    usd: z.string().nullable(),
                    usdChangePct: z.number().nullable()
                  }),

                  listedTokenCount: z.number()
                })
            ),
            pagination: z.object({
              total: z.number()
            })
          })
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
    }
  }
});

export default new OpenAPIHono().openapi(route, async (c) => {
  const rawSkip = parseInt(c.req.valid("query").skip ?? "0", 10);
  const rawLimit = parseInt(c.req.valid("query").limit ?? String(maxLimit), 10);
  const skip = Number.isFinite(rawSkip) && rawSkip >= 0 ? rawSkip : 0;
  const limit = Math.min(maxLimit, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : maxLimit);

  const mintStatus = c.req.valid("query").mintStatus;
  const sort = c.req.valid("query").sort;
  const period = (c.req.valid("query").period as "24h" | "7d" | "30d") ?? "7d";

  if (sort && !sortOptionsKeys.includes(sort as any)) {
    return c.json({ error: "Invalid sort option, valid options are: " + sortOptionsKeys.join(",") }, 400);
  }
  if (mintStatus && !mintStatusKeys.includes(mintStatus as any)) {
    return c.json({ error: "Invalid mintStatus, valid options are: " + mintStatusKeys.join(",") }, 400);
  }

  const result = await getCollections({
    skip,
    limit,
    mintStatus,
    sort: sort as any,
    period
  });

  return c.json({
    collections: result.collections,
    pagination: { total: result.total }
  });
});
