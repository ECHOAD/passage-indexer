import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getCreatedBids, getReceivedBids } from "@src/services/bid.service";
import { OpenAPI_ExampleOwner } from "@src/utils/constants";

const route = createRoute({
  method: "get",
  path: "/accounts/{address}/orders",
  summary: "Get a list of order received or created by an account.",
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "Account Address",
        example: OpenAPI_ExampleOwner
      })
    }),
    query: z.object({
      orderType: z.enum(["RECEIVED", "LISTED"]).openapi({ description: "Filter by order type" })
    })
  },
  responses: {
    200: {
      description: "List of nfts",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              nft: z.object({
                tokenId: z.string(),
                owner: z.string(),
                metadata: z.unknown({ description: "JSON Metadata" }),
                createdOnBlockHeight: z.number(),
                mintedOnBlockHeight: z.number(),
                mintPrice: z.string(),
                mintDenom: z.string()
              }),
              collection: z.object({
                address: z.string(),
                name: z.string(),
                image: z.string()
              }),
              rawTokenId: z.string(),
              price: z.string(),
              denom: z.string(),
              createdHeight: z.number(),
              createdDatetime: z.string(),
              createdByAddress: z.string()
            })
          )
        }
      }
    }
  }
});

export default new OpenAPIHono().openapi(route, async (c) => {
  const accountAddress = c.req.valid("param").address;
  const orderType = c.req.valid("query").orderType;

  if (orderType === "LISTED") {
    const bids = await getCreatedBids(accountAddress);

    return c.json(bids);
  } else if (orderType === "RECEIVED") {
    const bids = await getReceivedBids(accountAddress);

    return c.json(bids);
  } else {
    throw new Error("Invalid order type: " + orderType);
  }
});
