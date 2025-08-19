import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { db, and, eq, nftSale, block, gte, lte, day, count, sum, sql } from "database";

const route = createRoute({
  method: "get",
  path: "/stats/summary",
  summary: "Get marketplace statistics.",
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
      description: "Marketplace stats",
      content: {
        "application/json": {
          schema: z.object({
            totalSaleCount: z.number(),
            totalSaleVolume: z.object({
              upasg: z.string(),
              usd: z.string()
            }),
            totalRevenue: z.object({
              upasg: z.string(),
              usd: z.string()
            })
          })
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

  const [{ saleCount, saleVolumeUpasg, saleVolumeUsd, revenueUPasg, revenueUsd }] = await db
    .select({
      saleCount: count(),
      saleVolumeUpasg: sum(grossExpr),
      saleVolumeUsd: sum(sql`${grossExpr} * ${day.tokenPrice} / 1000000`),
      revenueUPasg: sum(nftSale.marketFee),
      revenueUsd: sum(sql`${nftSale.marketFee} * ${day.tokenPrice} / 1000000`)
    })
    .from(nftSale)
    .innerJoin(block, eq(nftSale.saleBlockHeight, block.height))
    .innerJoin(day, eq(block.dayId, day.id))
    .where(and(gte(block.datetime, parsedStartDate).if(startDate), lte(block.datetime, parsedEndDate).if(endDate)));

  return c.json({
    totalSaleCount: saleCount,
    totalSaleVolume: {
      upasg: saleVolumeUpasg || "0",
      usd: saleVolumeUsd || "0"
    },
    totalRevenue: {
      upasg: revenueUPasg || "0",
      usd: revenueUsd || "0"
    }
  });
});
