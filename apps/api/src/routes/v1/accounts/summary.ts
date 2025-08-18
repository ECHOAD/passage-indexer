import {createRoute, OpenAPIHono, z} from "@hono/zod-openapi";
import {IGNORED_COLLECTIONS, OpenAPI_ExampleOwner} from "@src/utils/constants";
import {
  count,
  db,
  eq,
  notInArray,
  sql,
  nft,
  nftListing,
  collection,
  isNull,
  min,
  and,
  asc
} from "database";

const route = createRoute({
  method: "get",
  path: "/accounts/{address}/summary",
  summary: "Get a list of NFTs owned by an account.",
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "Account Address",
        example: OpenAPI_ExampleOwner
      })
    }),
  },
  responses: {
    200: {
      description: "List of nfts",
      content: {
        "application/json": {
          schema: z.object({
            totalNfts: z.number(),
            collectionRelated: z.array(
                z.object({
                  name: z.string(),
                  address: z.string(),
                  quantity: z.number()
                })
            ),
            portFolioValue: z.string().optional().openapi({
              description: "Estimated portfolio value",
              example: "150000"
            })
          })
        }
      }
    }
  }
});

export default new OpenAPIHono().openapi(route, async (c) => {
  const accountAddress = c.req.param("address");

  // ----- Portfolio value (sum of floor prices for collections the account holds) -----
  const collectionFloorPrice = db
      .select({
        collection: nft.collection,
        floorPrice: min(nftListing.forSalePrice).as("floorPrice")
      })
      .from(nftListing)
      .innerJoin(nft, eq(nftListing.nft, nft.id))
      .where(isNull(nftListing.unlistedBlockHeight))
      .groupBy(nft.collection)
      .as("collectionFloorPrice");

  const [valueRow] = await db
      .select({
        totalValue: sql<number>`SUM(
        ${collectionFloorPrice.floorPrice}
        )`.as("totalValue")
      })
      .from(nft)
      .innerJoin(collection, eq(nft.collection, collection.address))
      .innerJoin(collectionFloorPrice, eq(nft.collection, collectionFloorPrice.collection))
      .where(
          and(eq(nft.owner, accountAddress), notInArray(nft.collection, IGNORED_COLLECTIONS))
      );

  const portFolioValueNumber = valueRow?.totalValue ?? 0;
  const portFolioValue = String(portFolioValueNumber);

  // ----- Collection breakdown (name, address, quantity) -----
  const collectionRelatedToTheAccount = await db
      .select({
        name: collection.name,
        address: collection.address,
        quantity: count(nft.id).as("quantity")
      })
      .from(collection)
      .innerJoin(nft, eq(nft.collection, collection.address))
      .where(and(eq(nft.owner, accountAddress), notInArray(collection.address, IGNORED_COLLECTIONS)))
      .groupBy(collection.address)
      .orderBy(asc(collection.name));

  const [{total}] = await db
      .select({
        total: count(nft.id).as("total")
      })
      .from(nft)
      .where(eq(nft.owner, accountAddress));

  return c.json(
      {
        totalNfts: total,
        collectionRelated: collectionRelatedToTheAccount,
        portFolioValue
      },
      200
  );
});
