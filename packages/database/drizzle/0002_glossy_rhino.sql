ALTER TABLE "nft_bid" ADD COLUMN "raw_token_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "nft_listing" ADD COLUMN "raw_token_id" varchar(255) NOT NULL;