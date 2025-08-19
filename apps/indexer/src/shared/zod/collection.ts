import { unknown, z } from "zod";

export const CollectionTxSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  minter: z.string(),
  collection_info: z.object({
    creator: z.string(),
    description: z.string(),
    image: z.string().url(),
    external_link: z.string().url(),
    royalty_info: z
      .object({
        payment_address: z.string(),
        share: z.string()
      })
      .nullable()
  })
});

export const CollectionMinterTxSchema = z.object({
  max_num_tokens: z.number(),
  cw721_code_id: z.number(),
  per_address_limit: z.number(),
  whitelist: z.unknown().nullable(), // TODO: Fin correct type
  cw721_address: z.string(),
  start_time: z.string(),
  unit_price: z.object({
    amount: z.string(),
    denom: z.string()
  }),
  cw721_instantiate_msg: z.string().nullable()
});

export const CollectionMarketplaceTxSchema = z.object({
  cw721_address: z.string(),
  denom: z.string(),
  collector_address: z.string(),
  trading_fee_bps: z.number(),
  operators: z.array(z.string()),
  min_price: z.string()
});

export const CollectionMetadataTxSchema = z.object({
  upsert_token_metadatas: z.object({
    token_metadatas: z.array(
      z.object({
        token_id: z.number(),
        metadata: z.unknown()
      })
    )
  })
});

export const CollectionMigrationTxSchema = z.object({
  migrate: z.object({
    migrations: z.array(
      z.object({
        token_id: z.string(),
        owner: z.string(),
        token_uri: z.string().nullable(),
        extension: z.unknown()
      })
    )
  })
});

export const CollectionMigrationDataTxSchema = z.object({
  migrate_data: z.object({
    migrations: z.object({
      tokens: z.array(
        z.object({
          token_id: z.number(),
          is_minted: z.boolean(),
          metadata: z.unknown()
        })
      )
    })
  })
});

export const CollectionMigrationMinterTxSchema = z.object({
  migrate_data: z.object({
    migrations: z.object({
      minters: z.array(
        z.object({
          mints: z.number({ coerce: true }),
          address: z.string()
        })
      )
    })
  })
});

export const CollectionMigrationMintableTokensTxSchema = z.object({
  migrate_data: z.object({
    migrations: z.object({
      mintable_tokens: z.array(z.number({ coerce: true }))
    })
  })
});

export const CollectionUpdateStartTimeTxSchema = z.object({
  update_start_time: z.string()
});

export const CollectionUpdateUnitPriceTxSchema = z.object({
  update_unit_price: z.object({
    unit_price: z.object({
      amount: z.string(),
      denom: z.string()
    })
  })
});

export const CollectionUpdateConfigSchema = z.object({
  update_config: z.object({
    trading_fee_bps: z.number().optional(),
    trading_fee_percent: z.string().optional(),
    collector_address: z.string().optional(),
    operators: z.array(z.string()).optional(),
    min_price: z.string().optional()
  })
});

export const CollectionSetAdminSchema = z.object({
  set_admin: z.object({
    admin: z.string()
  })
});

export const CollectionWithdrawSchema = z.object({
  withdraw: z.object({
    recipient: z.string()
  })
});

export const WhitelistInfoSchema = z.object({
  end_time: z.string(),
  member_limit: z.number(),
  members: z.array(z.string()),
  per_address_limit: z.number(),
  start_time: z.string(),
  unit_price: z.object({
    amount: z.string(),
    denom: z.string()
  })
});

export const WhitelistAddMembersSchema = z.object({
  add_members: z.object({
    to_add: z.array(z.string())
  })
});

export type CollectionTx = z.infer<typeof CollectionTxSchema>;
export type CollectionMinterTx = z.infer<typeof CollectionMinterTxSchema>;
export type CollectionMarketplaceTx = z.infer<typeof CollectionMarketplaceTxSchema>;
export type CollectionMetadataTx = z.infer<typeof CollectionMetadataTxSchema>;
export type CollectionMigrationTx = z.infer<typeof CollectionMigrationTxSchema>;
export type CollectionMigrationDataTx = z.infer<typeof CollectionMigrationDataTxSchema>;
export type CollectionMigrationMinterTx = z.infer<typeof CollectionMigrationMinterTxSchema>;
export type CollectionMigrationMintableTokensTx = z.infer<typeof CollectionMigrationMintableTokensTxSchema>;
export type CollectionUpdateStartTimeTx = z.infer<typeof CollectionUpdateStartTimeTxSchema>;
export type CollectionUpdateUnitPriceTx = z.infer<typeof CollectionUpdateUnitPriceTxSchema>;
export type CollectionUpdateConfigTx = z.infer<typeof CollectionUpdateConfigSchema>;
export type CollectionSetAdminTx = z.infer<typeof CollectionSetAdminSchema>;
export type CollectionWithdrawTx = z.infer<typeof CollectionWithdrawSchema>;
export type WhitelistInfoTx = z.infer<typeof WhitelistInfoSchema>;
export type WhitelistAddMembersTx = z.infer<typeof WhitelistAddMembersSchema>;
