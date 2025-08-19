import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { db, and, eq, nftSale, block, gte, lte, day, count, sum, sql } from "database";

const route = createRoute({
  method: "get",
  path: "/stats/graph",
  summary: "Get historical marketplace statistics.",
  request: {
    query: z.object({
      startDate: z
        .string()
        .optional()
        .refine((str) => !str || /^\d{4}-\d{2}-\d{2}$/.test(str), "Start Date must be in ISO format (ex: 2024-01-01)")
        .openapi({ description: "Start Date", example: "2024-01-01" }),
      endDate: z
        .string()
        .optional()
        .refine((str) => !str || /^\d{4}-\d{2}-\d{2}$/.test(str), "Start Date must be in ISO format (ex: 2024-01-01)")
        .openapi({ description: "End Date", example: "2025-01-01" })
    })
  },
  responses: {
    200: {
      description: "Daily marketplace stats",
      content: {
        "application/json": {
          schema: z.array(
            z.object({
              saleCount: z.number(),
              saleVolume: z.object({
                upasg: z.string(),
                usd: z.string()
              }),
              revenue: z.object({
                upasg: z.string(),
                usd: z.string()
              })
            })
          )
        }
      }
    }
  }
});

const grossExpr = sql`(${ nftSale.salePrice}::numeric 
                      + ${nftSale.marketFee}::numeric 
                      + ${nftSale.royaltyFee}::numeric)`;

export default new OpenAPIHono().openapi(route, async (c) => {
  const { startDate, endDate } = c.req.valid("query");

  const parsedStartDate = startDate ? new Date(startDate) : null;
  const parsedEndDate = endDate ? new Date(endDate) : null;

  const days = await db
    .select({
      date: day.date,
      saleCount: count(nftSale.id),
      saleVolumeUpasg: sum( grossExpr),
      saleVolumeUsd: sum(sql`${ grossExpr} * ${day.tokenPrice} / 1000000`),
      revenueUPasg: sum(nftSale.marketFee),
      revenueUsd: sum(sql`${nftSale.marketFee} * ${day.tokenPrice} / 1000000`)
    })
    .from(nftSale)
    .innerJoin(block, eq(nftSale.saleBlockHeight, block.height))
    .rightJoin(day, eq(block.dayId, day.id))
    .where(and(gte(day.date, parsedStartDate).if(startDate), lte(day.date, parsedEndDate).if(endDate)))
    .groupBy(day.id)
    .orderBy(day.date);

  return c.json(
    days.map((day) => ({
      date: day.date.toISOString().split("T")[0],
      saleCount: day.saleCount,
      saleVolume: {
        upasg: day.saleVolumeUpasg || "0",
        usd: day.saleVolumeUsd || "0"
      },
      revenue: {
        upasg: day.revenueUPasg || "0",
        usd: day.revenueUsd || "0"
      }
    })),
    200
  );
});
