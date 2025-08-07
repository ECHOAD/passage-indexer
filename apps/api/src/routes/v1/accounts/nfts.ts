import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {IGNORED_COLLECTIONS, OpenAPI_ExampleOwner} from "@src/utils/constants";
import {count, db, eq, sql, and, asc, nft, nftListing, collection, notInArray, min, isNull} from "database";

const maxLimit = 100;

const route = createRoute({
  method: "get",
  path: "/accounts/{address}/nfts",
  summary: "Get a list of NFTs owned by an account.",
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "Account Address",
        example: OpenAPI_ExampleOwner
      })
    }),
    query: z.object({
      skip: z.string().optional().default("0").openapi({ description: "NFTs to skip" }),
      limit: z.string().optional().default(maxLimit.toString()).openapi({ description: "NFTs to return", maximum: maxLimit }),
      collectionAddress: z.string().optional().openapi({
        description: "Filter by collection address"
      })
    })
  },
  responses: {
    200: {
      description: "List of nfts",
      content: {
        "application/json": {
          schema: z.object({
            nfts: z.array(
              z.object({
                tokenId: z.number(),
                owner: z.string(),
                collection: z.object({
                  address: z.string(),
                  name: z.string()
                }),
                metadata: z.unknown({ description: "JSON Metadata" }),
                createdOnBlockHeight: z.number(),
                mintedOnBlockHeight: z.number(),
                mintPrice: z.string(),
                mintDenom: z.string(),
                listedPrice: z.string().nullable(),
                listedDenom: z.string().nullable()
              })
            ),
            pagination: z.object({
              total: z.number()
            }),
            metadata: z.object({
              collectionRelated: z.object({
                name: z.string(),
                address: z.string()
              }),
              portFolioValue: z.string().optional().openapi({
                description: "Estimated portfolio value",
                example: "150000"
              }),
            })
          })
        }
      }
    }
  }
});

export default new OpenAPIHono().openapi(route, async (c) => {
  const accountAddress = c.req.valid("param").address;
  const skip = parseInt(c.req.valid("query").skip);
  const limit = Math.min(maxLimit, parseInt(c.req.valid("query").limit));
  const collectionAddress = c.req.valid("query").collectionAddress;

  const [{ count: totalCount }] = await db.select({ count: count() }).from(nft)
      .where(and(eq(nft.owner, accountAddress), notInArray(nft.collection, IGNORED_COLLECTIONS)));

  const conditions = [
    eq(nft.owner, accountAddress),
    notInArray(nft.collection, IGNORED_COLLECTIONS)
  ];

  if (collectionAddress) {
    conditions.push(eq(nft.collection, collectionAddress));
  }

  const nfts = await db
    .select()
    .from(nft)
    .where(and(...conditions))
    .leftJoin(nftListing, eq(nftListing.id, nft.activeListingId))
    .innerJoin(collection, eq(collection.address, nft.collection))
    .offset(skip)
    .limit(limit)
    .orderBy(asc(nft.tokenId));


  const collectionFloorPrice = db
      .select({
        collection: nft.collection,
        floorPrice: min(nftListing.forSalePrice).as('floorPrice')
      })
      .from(nftListing)
      .innerJoin(nft, eq(nftListing.nft, nft.id))
      .where(isNull(nftListing.unlistedBlockHeight))
      .groupBy(nft.collection)
      .as('collectionFloorPrice');

  const [result] = await db
      .select({
        totalValue: sql<number>`SUM(${collectionFloorPrice.floorPrice})`.as('totalValue')
      })
      .from(nft)
      .innerJoin(collection, eq(nft.collection, collection.address))
      .innerJoin(collectionFloorPrice, eq(nft.collection, collectionFloorPrice.collection))
      .where(and(
          eq(nft.owner, accountAddress),
          notInArray(nft.collection, IGNORED_COLLECTIONS)
      ));

  const portFolioValue = result?.totalValue ?? 0;

  const collectionRelatedToTheAccount = await db
    .select({
        name: collection.name,
        address: collection.address
    })
    .from(collection)
    .innerJoin(nft, eq(nft.collection, collection.address))
    .where(and(eq(nft.owner, accountAddress), notInArray(collection.address, IGNORED_COLLECTIONS)))
    .groupBy(collection.address)


  return c.json({
    nfts: nfts.map(({ nft, nft_listing: activeListing, collection }) => ({
      tokenId: nft.tokenId,
      owner: nft.owner,
      collection: {
        address: nft.collection,
        name: collection.name
      },
      metadata: nft.metadata,
      createdOnBlockHeight: nft.createdOnBlockHeight,
      mintedOnBlockHeight: nft.mintedOnBlockHeight,
      mintPrice: nft.mintPrice,
      mintDenom: nft.mintDenom,
      listedPrice: activeListing?.forSalePrice || null,
      listedDenom: activeListing?.forSaleDenom || null
    })),
    pagination: {
      total: totalCount
    },
    metadata: {
        collectionRelated: collectionRelatedToTheAccount,
        portFolioValue: portFolioValue
    }
  });
});
