import { z } from "zod";

const coinSchema = z.object({
  amount: z.string(),
  denom: z.string()
});

export const AuctionInstantiateSchema = z.object({
  cw721_address: z.string(),
  denom: z.string(),
  collector_address: z.string(),
  trading_fee_bps: z.number(),
  operators: z.array(z.string()),
  min_price: z.string(),
  min_bid_increment: z.string(),
  min_duration: z.number(),
  max_duration: z.number(),
  closed_duration: z.number(),
  buffer_duration: z.number()
});

export const AuctionSetAuctionSchema = z.object({
  set_auction: z.object({
    token_id: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    starting_price: coinSchema,
    reserve_price: coinSchema.optional().nullable(),
    funds_recipient: z.string().optional().nullable()
  })
});

export const AuctionSetBidSchema = z.object({
  set_auction_bid: z.object({
    token_id: z.string(),
    price: coinSchema
  })
});

export const AuctionCloseSchema = z.object({
  close_auction: z.object({
    token_id: z.string(),
    accept_highest_bid: z.boolean()
  })
});

export const AuctionFinalizeSchema = z.object({
  finalize_auction: z.object({
    token_id: z.string()
  })
});

export const AuctionVoidSchema = z.object({
  void_auction: z.object({
    token_id: z.string()
  })
});

export const AuctionUpdateConfigSchema = z.object({
  update_config: z.object({
    collector_address: z.string().optional(),
    trading_fee_bps: z.number().optional(),
    operators: z.array(z.string()).optional(),
    min_price: z.string().optional(),
    min_bid_increment: z.string().optional(),
    min_duration: z.number().optional(),
    max_duration: z.number().optional(),
    closed_duration: z.number().optional(),
    buffer_duration: z.number().optional()
  })
});

export type AuctionSetAuctionTx = z.infer<typeof AuctionSetAuctionSchema>;
export type AuctionSetBidTx = z.infer<typeof AuctionSetBidSchema>;
export type AuctionCloseTx = z.infer<typeof AuctionCloseSchema>;
export type AuctionFinalizeTx = z.infer<typeof AuctionFinalizeSchema>;
export type AuctionVoidTx = z.infer<typeof AuctionVoidSchema>;
export type AuctionInstantiateTx = z.infer<typeof AuctionInstantiateSchema>;
export type AuctionUpdateConfigTx = z.infer<typeof AuctionUpdateConfigSchema>;
