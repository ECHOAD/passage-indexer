import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getNftBids, getNftActiveListings, getNftSales } from "@src/services/nft.service";
import { OpenAPI_ExampleCollection } from "@src/utils/constants";
import { round } from "@src/utils/math";
import { db, and, eq, nft as nftTable, block as blockTable, day as dayTable } from "database";

const route = createRoute({
  method: "get",
  path: "/collections/{address}/nfts/{tokenId}",
  summary: "Get an NFT details.",
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "Collection Address",
        example: OpenAPI_ExampleCollection
      }),
      tokenId: z.string().openapi({ description: "Token ID", example: "301", type: "number" })
    })
  },
  responses: {
    404: {
      description: "Collection or NFT not found"
    },
    200: {
      description: "NFT details",
      content: {
        "application/json": {
          schema: z.object({
            tokenId: z.string(),
            owner: z.string(),
            metadata: z.unknown({ description: "JSON Metadata" }),
            createdOnBlockHeight: z.number(),
            mintedOnBlockHeight: z.number(),
            mintPrice: z.number(),
            mintDenom: z.string(),
            collection: z.string(),
            bids: z.array(
              z.object({
                address: z.string(),
                datetime: z.string().nullable(),
                price: z.number(),
                denom: z.string(),
                usdPrice: z.number().nullable()
              })
            ),
            listings: z.array(
              z.object({
                datetime: z.string().nullable(),
                price: z.number(),
                rawTokenId: z.string(),
                denom: z.string(),
                usdPrice: z.number().nullable()
              })
            ),
            priceHistory: z.array(
              z.object({
                type: z.enum(["mint", "sale"]),
                buyer: z.string().nullable(),
                datetime: z.string().nullable(),
                price: z.number(),
                denom: z.string(),
                usdPrice: z.number().nullable()
              })
            )
          })
        }
      }
    }
  }
});

export default new OpenAPIHono().openapi(route, async (c) => {
  const collectionAddress = c.req.valid("param").address;
  const tokenId = parseInt(c.req.valid("param").tokenId);

  const collection = await db.query.collection.findFirst({
    where: (table) => eq(table.address, collectionAddress)
  });

  if (!collection) {
    return c.text("Collection not found", 404);
  }

  const [result] = await db
    .select()
    .from(nftTable)
    .leftJoin(blockTable, eq(nftTable.mintedOnBlockHeight, blockTable.height))
    .leftJoin(dayTable, eq(blockTable.dayId, dayTable.id))
    .where(and(eq(nftTable.collection, collectionAddress), eq(nftTable.tokenId, tokenId)));

  if (!result) {
    return c.text("NFT not found", 404);
  }

  const { nft, block: mintedOnBlock, day: mintedOnDay } = result;

  const [sales, bids, activeListings] = await Promise.all([getNftSales(nft.id), getNftBids(nft.id), getNftActiveListings(nft.id)]);

  let salesEntries = sales.map((sale) => ({
    type: "sale",
    buyer: sale.newOwner,
    datetime: sale.block?.datetime ?? null,
    price: (Number(sale.salePrice) + Number(sale.marketFee) + Number(sale.royaltyFee)).toString(),
    denom: sale.saleDenom,
    usdPrice: getUsdPrice(sale.salePrice, sale.saleDenom, sale.block?.day.tokenPrice)
  }));

  const priceHistory = mintedOnBlock
    ? [
        {
          type: "mint",
          datetime: mintedOnBlock?.datetime ?? null,
          price: nft.mintPrice,
          denom: nft.mintDenom,
          usdPrice: getUsdPrice(nft.mintPrice, nft.mintDenom, mintedOnDay?.tokenPrice)
        },
        ...salesEntries
      ]
    : salesEntries;

  return c.json({
    tokenId: nft.tokenId,
    owner: nft.owner,
    metadata: nft.metadata,
    createdOnBlockHeight: nft.createdOnBlockHeight,
    mintedOnBlockHeight: nft.mintedOnBlockHeight,
    mintPrice: nft.mintPrice,
    mintDenom: nft.mintDenom,
    collection: nft.collection,
    bids: bids.map((bid) => ({
      address: bid.owner,
      datetime: bid.block?.datetime ?? null,
      price: bid.bidPrice,
      denom: bid.bidDenom,
      usdPrice: getUsdPrice(bid.bidPrice, bid.bidDenom, bid.block?.day.tokenPrice)
    })),
    listings: activeListings.map((listing) => ({
      datetime: listing.block?.datetime ?? null,
      rawTokenId: listing.rawTokenId,
      price: listing.forSalePrice,
      denom: listing.forSaleDenom,
      usdPrice: getUsdPrice(listing.forSalePrice, listing.forSaleDenom, listing.block?.day.tokenPrice)
    })),
    priceHistory: priceHistory
  });
});

function getUsdPrice(amount: string, denom: string, tokenPrice: number | null) {
  if (!amount || !tokenPrice) {
    return null;
  }

  // TODO: Handle other denoms?

  return round((parseFloat(amount) * tokenPrice) / 1_000_000, 2);
}
