// GET /collections/{address}/traits
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { OpenAPI_ExampleCollection } from "@src/utils/constants";
import { getCollectionTraitsOnly } from "@src/services/collection.service";

const TraitSchema = z.object({
  traitType: z.string(),
  traitValue: z.string(),
}).strict();

const route = createRoute({
  method: "get",
  path: "/collections/{address}/traits",
  summary: "List collection traits (type/value only)",
  request: {
    params: z.object({
      address: z.string().openapi({
        description: "Collection Address",
        example: OpenAPI_ExampleCollection,
      }),
    }),
    query: z.object({
      traitType: z.string().optional().openapi({
        description: "Filter by specific trait type",
        example: "Background",
      }),
    }),
  },
  responses: {
    404: { description: "Collection not found" },
    200: {
      description: "List of distinct traits (type/value) for the collection",
      content: { "application/json": { schema: z.array(TraitSchema) } },
    },
  },
});

export default new OpenAPIHono().openapi(route, async (c) => {
  const { address } = c.req.valid("param");
  const { traitType } = c.req.valid("query");

  try {
    const traits = await getCollectionTraitsOnly(address, { traitType });
    return c.json(traits);
  } catch (error) {
    if (error instanceof Error && error.message === "Collection not found") {
      return c.text("Collection not found", 404);
    }
    throw error;
  }
});