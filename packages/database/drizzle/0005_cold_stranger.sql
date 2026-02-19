DROP INDEX "staked_nft_vault_collection_token_idx";--> statement-breakpoint
ALTER TABLE "nft" ADD COLUMN "raw_token_id" varchar(255) NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "nft_collection_raw_token_id" ON "nft" USING btree ("collection","raw_token_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staked_nft_vault_collection_token_active_idx" ON "staked_nft" USING btree ("vault_address","collection_address","token_id") WHERE unstaked_at_height IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "staked_nft_vault_collection_token_height_idx" ON "staked_nft" USING btree ("vault_address","collection_address","token_id","staked_at_height");