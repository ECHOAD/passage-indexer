import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getCollectionStats } from "@src/services/collection.service";
import { OpenAPI_ExampleCollection } from "@src/utils/constants";
import { db, eq } from "database";

const route = createRoute({
  method: "get",
  path: "/collections/{address}",
  summary: "Get a collection by address.",
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "Collection Address",
        example: OpenAPI_ExampleCollection
      })
    })
  },
  responses: {
    404: { description: "Collection not found" },
    200: {
      description: "Collection details",
      content: {
        "application/json": {
          schema:  z.object({
            address: z.string(),
            createdHeight: z.number(),
            name: z.string(),
            symbol: z.string(),
            mintContract: z.string().nullable(),
            marketContract: z.string().nullable(),
            marketDenom: z.string().nullable(),
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
            collectorAddress: z.string().nullable(),
            tradingFeeBps: z.string().nullable(),
            minPrice: z.string().nullable(),
            auctionContract: z.string().nullable(),
            auctionDenom: z.string().nullable(),
            auctionCollectorAddress: z.string().nullable(),
            auctionTradingFeeBps: z.string().nullable(),
            auctionMinPrice: z.string().nullable(),
            auctionMinBidIncrement: z.string().nullable(),
            auctionMinDuration: z.number().nullable(),
            auctionMaxDuration: z.number().nullable(),
            auctionClosedDuration: z.number().nullable(),
            auctionBufferDuration: z.number().nullable(),
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
        }
      }
    }
  }
});

export default new OpenAPIHono().openapi(route, async (c) => {
  const collectionAddress = c.req.valid("param").address;

  const collection = await db.query.collection.findFirst({
    where: (table) => eq(table.address, collectionAddress)
  });

  if (!collection) {
    return c.text("Collection not found", 404);
  }

  const stats = await getCollectionStats(collectionAddress);

  return c.json({
    address: collection.address,
    createdHeight: collection.createdHeight,
    name: collection.name,
    symbol: collection.symbol,
    mintContract: collection.mintContract,
    marketContract: collection.marketContract,
    marketDenom: collection.marketDenom,
    minter: collection.minter,
    creator: collection.creator,
    description: collection.description,
    image: collection.image,
    externalLink: collection.externalLink,
    royaltyAddress: collection.royaltyAddress,
    royaltyFee: collection.royaltyFee,
    maxNumToken: collection.maxNumToken,
    perAddressLimit: collection.perAddressLimit,
    startTime: collection.startTime,
    unitPrice: collection.unitPrice,
    unitDenom: collection.unitDenom,
    collectorAddress: collection.collectorAddress,
    tradingFeeBps: collection.tradingFeeBps,
    minPrice: collection.minPrice,
    auctionContract: collection.auctionContract,
    auctionDenom: collection.auctionDenom,
    auctionCollectorAddress: collection.auctionCollectorAddress,
    auctionTradingFeeBps: collection.auctionTradingFeeBps,
    auctionMinPrice: collection.auctionMinPrice,
    auctionMinBidIncrement: collection.auctionMinBidIncrement,
    auctionMinDuration: collection.auctionMinDuration,
    auctionMaxDuration: collection.auctionMaxDuration,
    auctionClosedDuration: collection.auctionClosedDuration,
    auctionBufferDuration: collection.auctionBufferDuration,
    ...stats
  });
});
