import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { OpenAPI_ExampleOwner } from "@src/utils/constants";
import { getAccountNfts, AccountNftsSort } from "@src/services/account-nfts.service";

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
      }),
      minPrice: z.string().optional().openapi({ description: "Filter by min price" }),
      maxPrice: z.string().optional().openapi({ description: "Filter by max price" }),
      saleType: z
          .string()
          .optional()
          .openapi({
            description: "Filter by sale type",
            enum: ["LIVE_AUCTION", "FIXED_PRICE", "NOT_FOR_SALE"]
          }),
      sort: z.string().optional().openapi({
        description: "Sort order",
        enum: ["tokenIdAsc", "tokenIdDesc", "priceAsc", "priceDesc"]
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
  const saleType = c.req.valid("query").saleType as "FIXED_PRICE" | "NOT_FOR_SALE" | undefined;
  const sort = (c.req.valid("query").sort as AccountNftsSort | undefined) ?? "tokenIdAsc";

  const minPrice = c.req.valid("query").minPrice ? Math.max(0, parseInt(c.req.valid("query").minPrice)) : null;
  const maxPrice = c.req.valid("query").maxPrice ? Math.max(0, parseInt(c.req.valid("query").maxPrice)) : null;

  const { nfts, totalCount } = await getAccountNfts({
    ownerAddress: accountAddress,
    collectionAddress,
    saleType,
    sort,
    skip,
    limit,
    minPrice: minPrice ?? undefined,
    maxPrice: maxPrice ?? undefined
  });


  const nftsOut = nfts.map(n => ({
    ...n,
    tokenId: typeof n.tokenId === "string" ? parseInt(n.tokenId, 10) : n.tokenId
  }));

  return c.json({
    nfts: nftsOut,
    pagination: {
      total: totalCount
    }
  });
});
