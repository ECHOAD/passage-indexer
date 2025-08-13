CREATE INDEX "nft_to_trait_nft_id" ON "nft_to_trait" USING btree ("nft_id");--> statement-breakpoint
CREATE INDEX "nft_to_trait_trait_id" ON "nft_to_trait" USING btree ("trait_id");--> statement-breakpoint
CREATE INDEX "nft_trait_collection_type_value" ON "nft_trait" USING btree ("collection","trait_type","trait_value");--> statement-breakpoint
CREATE INDEX "nft_trait_type_value" ON "nft_trait" USING btree ("trait_type","trait_value");