import { z } from "zod";

export const NftMintTxSchema = z.object({
  mint: z.object({})
});

export const NftSetAskSchema = z.object({
  set_ask: z.object({
    price: z.object({
      amount: z.string(),
      denom: z.string()
    }),
    token_id: z.string()
  })
});

export const NftRemoveAskSchema = z.object({
  remove_ask: z.object({
    token_id: z.string()
  })
});

export const NftSetBidSchema = z.object({
  set_bid: z.object({
    price: z.object({
      amount: z.string(),
      denom: z.string()
    }),
    token_id: z.string()
  })
});

export const NftRemoveBidSchema = z.object({
  remove_bid: z.object({
    token_id: z.string().or(z.number())
  })
});

export const NftTransferSchema = z.object({
  transfer_nft: z.object({
    recipient: z.string(),
    token_id: z.string()
  })
});

export const NftMintToSchema = z.object({
  mint_to: z.object({
    recipient: z.string()
  })
});

export const NftCollectionBidSchema = z.object({
  set_collection_bid: z.object({
    units: z.number(),
    price: z.object({
      amount: z.string(),
      denom: z.string()
    })
  })
});

export const NftRemoveCollectionBidSchema = z.object({
  remove_collection_bid: z.object({})
});

export const NftAcceptCollectionBidSchema = z.object({
  accept_collection_bid: z.object({
    token_id: z.string(),
    bidder: z.string()
  })
});

export const NftAcceptBidSchema = z.object({
  accept_bid: z.object({
    bidder: z.string(),
    token_id: z.string()
  })
});

export const NftMetadataSchema = z.object({
  image: z.string().nullable().optional(),
  image_data: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  external_url: z.string().nullable().optional(),
  background_color: z.string().nullable().optional(),
  animation_url: z.string().nullable().optional(),
  youtube_url: z.string().nullable().optional(),
  // CW721 metadata in the wild routinely omits display_type and uses numeric/boolean
  // values. Keep this tolerant so parsing succeeds and the normalizer below runs —
  // a strict schema here silently dropped name/image/traits for whole collections.
  attributes: z.array(
    z.object({
      display_type: z.string().nullish(),
      trait_type: z.string().nullish(),
      value: z.union([z.string(), z.number(), z.boolean()]).nullish()
    })
  ).nullish()
});

export type NftMintTx = z.infer<typeof NftMintTxSchema>;
export type NftSetAskTx = z.infer<typeof NftSetAskSchema>;
export type NftRemoveAskTx = z.infer<typeof NftRemoveAskSchema>;
export type NftSetBidTx = z.infer<typeof NftSetBidSchema>;
export type NftRemoveBidTx = z.infer<typeof NftRemoveBidSchema>;
export type NftTransferTx = z.infer<typeof NftTransferSchema>;
export type NftMintToTx = z.infer<typeof NftMintToSchema>;
export type NftCollectionBidTx = z.infer<typeof NftCollectionBidSchema>;
export type NftRemoveCollectionBidTx = z.infer<typeof NftRemoveCollectionBidSchema>;
export type NftAcceptCollectionBidTx = z.infer<typeof NftAcceptCollectionBidSchema>;
export type NftMetadataTx = z.infer<typeof NftMetadataSchema>;
