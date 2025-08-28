// GET /collections/{address}/traits/stats  (date-range; default last 30d)
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { OpenAPI_ExampleCollection } from "@src/utils/constants";
import { getCollectionTraitsStats } from "@src/services/collection.service";
import { getLastProcessedISODate } from "@src/services/block.service";
import {normalizeInputToISO} from "@src/utils";

const TraitPeriodStatsSchema = z.object({
  traitType: z.string(),
  traitValue: z.string(),
  totalSales: z.number(),
  totalVolume: z.object({
    upasg: z.string().nullable(),
    usd: z.string().nullable(),
  }).strict(),
  salesInPeriod: z.number(),
  salesChangePct: z.number().nullable(),
  volumeInPeriod: z.object({
    upasg: z.string().nullable(),
    upasgChangePct: z.number().nullable(),
    usd: z.string().nullable(),
    usdChangePct: z.number().nullable(),
  }).strict(),
}).strict();

const route = createRoute({
  method: "get",
  path: "/collections/{address}/traits/stats",
  summary: "Get collection trait statistics (date-range; defaults to last 30 days)",
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
      // Acepta 'YYYY-MM-DD' o ISO 8601. Se normaliza a ISO internamente.
      startDate: z.string().min(1).optional().openapi({
        description:
            "Start date or datetime. Accepts 'YYYY-MM-DD' or ISO 8601. Default: endDate-30d if omitted.",
        examples: ["2025-07-01", "2025-07-01T00:00:00Z"],
      }),
      endDate: z.string().min(1).optional().openapi({
        description:
            "End date or datetime. Accepts 'YYYY-MM-DD' or ISO 8601. Default: last processed day if omitted.",
        examples: ["2025-07-31", "2025-07-31T00:00:00Z"],
      }),
      sortBy: z.enum(["top", "trending"]).optional().openapi({
        description: "Sort by volume (top) or sales count (trending) within the current window",
        example: "top",
      }),
    }),
  },
  responses: {
    400: { description: "Invalid date range" },
    404: { description: "Collection not found" },
    200: {
      description: "Collection trait statistics for the requested window",
      content: { "application/json": { schema: z.array(TraitPeriodStatsSchema) } },
    },
  },
});


export default new OpenAPIHono().openapi(route, async (c) => {
  const { address } = c.req.valid("param");
  const q = c.req.valid("query");
  const { traitType, sortBy } = q;

  const lastProcessedISO = await getLastProcessedISODate(); // string (idealmente ISO)
  const endISORaw = q.endDate ?? lastProcessedISO;

  const endISO = normalizeInputToISO(endISORaw, "end");
  const startISO =
      normalizeInputToISO(q.startDate, "start") ??
      new Date(new Date(endISO!).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  if (!endISO) {
    return c.text("Invalid endDate format. Use 'YYYY-MM-DD' or ISO 8601.", 400);
  }
  if (!startISO) {
    return c.text("Invalid startDate format. Use 'YYYY-MM-DD' or ISO 8601.", 400);
  }
  if (new Date(startISO) >= new Date(endISO)) {
    return c.text("Invalid date range: startDate must be before endDate.", 400);
  }

  try {
    const traits = await getCollectionTraitsStats(address, {
      traitType,
      sortBy,
      startDate: startISO,
      endDate: endISO,
    });
    return c.json(traits);
  } catch (error) {
    if (error instanceof Error && error.message === "Collection not found") {
      return c.text("Collection not found", 404);
    }
    throw error;
  }
});
