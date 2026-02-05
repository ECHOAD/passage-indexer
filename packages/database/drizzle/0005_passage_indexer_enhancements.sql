CREATE TYPE "public"."nft_sale_type" AS ENUM('fixed_price', 'auction_english', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."nft_auction_status" AS ENUM('active', 'closed', 'finalized', 'voided');--> statement-breakpoint
CREATE TABLE "denom" (
	"denom" varchar(255) PRIMARY KEY NOT NULL,
	"display_denom" varchar(255),
	"base_denom" varchar(255),
	"decimals" integer DEFAULT 6 NOT NULL,
	"symbol" varchar(64),
	"coingecko_id" varchar(255),
	"is_native" boolean DEFAULT false NOT NULL,
	"is_ibc" boolean DEFAULT false NOT NULL,
	"is_convertible" boolean DEFAULT false NOT NULL,
	"chain_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "denom_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"denom" varchar(255) NOT NULL,
	"date" date NOT NULL,
	"usd_price" numeric,
	"source" varchar(255),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nft_mint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nft_id" uuid NOT NULL,
	"minter" varchar(255) NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"mint_price" numeric,
	"mint_denom" varchar(255),
	"mint_block_height" integer NOT NULL,
	"is_airdrop" boolean DEFAULT false NOT NULL,
	"transaction_id" uuid,
	"transaction_event_id" uuid
);
--> statement-breakpoint
CREATE TABLE "nft_auction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_contract" varchar(255) NOT NULL,
	"collection" varchar(255) NOT NULL,
	"nft_id" uuid,
	"token_id" integer,
	"raw_token_id" varchar(255) NOT NULL,
	"seller" varchar(255) NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"starting_price" numeric NOT NULL,
	"starting_denom" varchar(255) NOT NULL,
	"reserve_price" numeric,
	"reserve_denom" varchar(255),
	"highest_bid_price" numeric,
	"highest_bid_denom" varchar(255),
	"highest_bidder" varchar(255),
	"highest_bid_block_height" integer,
	"status" "nft_auction_status" DEFAULT 'active' NOT NULL,
	"created_block_height" integer NOT NULL,
	"closed_block_height" integer,
	"finalized_block_height" integer,
	"voided_block_height" integer,
	"transaction_id" uuid,
	"transaction_event_id" uuid
);
--> statement-breakpoint
CREATE TABLE "nft_auction_bid" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auction_id" uuid NOT NULL,
	"bidder" varchar(255) NOT NULL,
	"bid_price" numeric NOT NULL,
	"bid_denom" varchar(255) NOT NULL,
	"bid_block_height" integer NOT NULL,
	"refunded_block_height" integer,
	"is_highest" boolean DEFAULT false NOT NULL,
	"transaction_event_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" numeric,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "block" ADD COLUMN "parent_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "market_denom" varchar(255);--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "auction_contract" varchar(255);--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "auction_denom" varchar(255);--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "auction_collector_address" varchar(255);--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "auction_trading_fee_bps" numeric;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "auction_min_price" numeric;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "auction_min_bid_increment" numeric;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "auction_min_duration" integer;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "auction_max_duration" integer;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "auction_closed_duration" integer;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "auction_buffer_duration" integer;--> statement-breakpoint
ALTER TABLE "whitelist" ALTER COLUMN "unit_price" TYPE numeric USING "unit_price"::numeric;--> statement-breakpoint
ALTER TABLE "whitelist" ADD COLUMN "unit_denom" varchar(255) DEFAULT 'upasg' NOT NULL;--> statement-breakpoint
ALTER TABLE "nft_sale" ADD COLUMN "source_contract" varchar(255);--> statement-breakpoint
ALTER TABLE "nft_sale" ADD COLUMN "sale_type" "nft_sale_type" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "nft_sale" ADD COLUMN "transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "nft_sale" ADD COLUMN "transaction_event_id" uuid;--> statement-breakpoint
ALTER TABLE "nft_sale" ALTER COLUMN "royalty_fee_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "nft_listing" ADD COLUMN "market_contract" varchar(255);--> statement-breakpoint
ALTER TABLE "nft_listing" ADD COLUMN "transaction_event_id" uuid;--> statement-breakpoint
ALTER TABLE "nft_bid" ADD COLUMN "market_contract" varchar(255);--> statement-breakpoint
ALTER TABLE "nft_bid" ADD COLUMN "transaction_event_id" uuid;--> statement-breakpoint
ALTER TABLE "nft_collection_bid" ADD COLUMN "market_contract" varchar(255);--> statement-breakpoint
ALTER TABLE "nft_collection_bid" ADD COLUMN "transaction_event_id" uuid;--> statement-breakpoint
ALTER TABLE "nft_transfer" ADD COLUMN "transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "nft_transfer" ADD COLUMN "transaction_event_id" uuid;--> statement-breakpoint
ALTER TABLE "denom_rate" ADD CONSTRAINT "denom_rate_denom_denom_fk" FOREIGN KEY ("denom") REFERENCES "public"."denom"("denom") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_mint" ADD CONSTRAINT "nft_mint_nft_id_nft_id_fk" FOREIGN KEY ("nft_id") REFERENCES "public"."nft"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_mint" ADD CONSTRAINT "nft_mint_mint_block_height_block_height_fk" FOREIGN KEY ("mint_block_height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_mint" ADD CONSTRAINT "nft_mint_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_mint" ADD CONSTRAINT "nft_mint_transaction_event_id_transaction_event_id_fk" FOREIGN KEY ("transaction_event_id") REFERENCES "public"."transaction_event"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction" ADD CONSTRAINT "nft_auction_collection_collection_address_fk" FOREIGN KEY ("collection") REFERENCES "public"."collection"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction" ADD CONSTRAINT "nft_auction_nft_id_nft_id_fk" FOREIGN KEY ("nft_id") REFERENCES "public"."nft"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction" ADD CONSTRAINT "nft_auction_highest_bid_block_height_block_height_fk" FOREIGN KEY ("highest_bid_block_height") REFERENCES "public"."block"("height") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction" ADD CONSTRAINT "nft_auction_created_block_height_block_height_fk" FOREIGN KEY ("created_block_height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction" ADD CONSTRAINT "nft_auction_closed_block_height_block_height_fk" FOREIGN KEY ("closed_block_height") REFERENCES "public"."block"("height") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction" ADD CONSTRAINT "nft_auction_finalized_block_height_block_height_fk" FOREIGN KEY ("finalized_block_height") REFERENCES "public"."block"("height") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction" ADD CONSTRAINT "nft_auction_voided_block_height_block_height_fk" FOREIGN KEY ("voided_block_height") REFERENCES "public"."block"("height") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction" ADD CONSTRAINT "nft_auction_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction" ADD CONSTRAINT "nft_auction_transaction_event_id_transaction_event_id_fk" FOREIGN KEY ("transaction_event_id") REFERENCES "public"."transaction_event"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction_bid" ADD CONSTRAINT "nft_auction_bid_auction_id_nft_auction_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."nft_auction"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction_bid" ADD CONSTRAINT "nft_auction_bid_bid_block_height_block_height_fk" FOREIGN KEY ("bid_block_height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction_bid" ADD CONSTRAINT "nft_auction_bid_refunded_block_height_block_height_fk" FOREIGN KEY ("refunded_block_height") REFERENCES "public"."block"("height") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_auction_bid" ADD CONSTRAINT "nft_auction_bid_transaction_event_id_transaction_event_id_fk" FOREIGN KEY ("transaction_event_id") REFERENCES "public"."transaction_event"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_sale" ADD CONSTRAINT "nft_sale_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_sale" ADD CONSTRAINT "nft_sale_transaction_event_id_transaction_event_id_fk" FOREIGN KEY ("transaction_event_id") REFERENCES "public"."transaction_event"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_listing" ADD CONSTRAINT "nft_listing_transaction_event_id_transaction_event_id_fk" FOREIGN KEY ("transaction_event_id") REFERENCES "public"."transaction_event"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_bid" ADD CONSTRAINT "nft_bid_transaction_event_id_transaction_event_id_fk" FOREIGN KEY ("transaction_event_id") REFERENCES "public"."transaction_event"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_collection_bid" ADD CONSTRAINT "nft_collection_bid_transaction_event_id_transaction_event_id_fk" FOREIGN KEY ("transaction_event_id") REFERENCES "public"."transaction_event"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_transfer" ADD CONSTRAINT "nft_transfer_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_transfer" ADD CONSTRAINT "nft_transfer_transaction_event_id_transaction_event_id_fk" FOREIGN KEY ("transaction_event_id") REFERENCES "public"."transaction_event"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "denom_rate_denom_date_unique" ON "denom_rate" USING btree ("denom","date");--> statement-breakpoint
CREATE UNIQUE INDEX "whitelist_address_unique" ON "whitelist" USING btree ("address");--> statement-breakpoint
CREATE INDEX "denom_display_idx" ON "denom" USING btree ("display_denom");--> statement-breakpoint
CREATE INDEX "denom_base_idx" ON "denom" USING btree ("base_denom");--> statement-breakpoint
CREATE INDEX "denom_cg_idx" ON "denom" USING btree ("coingecko_id");--> statement-breakpoint
CREATE INDEX "denom_rate_denom_idx" ON "denom_rate" USING btree ("denom");--> statement-breakpoint
CREATE INDEX "denom_rate_date_idx" ON "denom_rate" USING btree ("date");--> statement-breakpoint
CREATE INDEX "nft_mint_nft_idx" ON "nft_mint" USING btree ("nft_id");--> statement-breakpoint
CREATE INDEX "nft_mint_block_idx" ON "nft_mint" USING btree ("mint_block_height");--> statement-breakpoint
CREATE INDEX "nft_mint_tx_event_idx" ON "nft_mint" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE INDEX "nft_auction_contract_idx" ON "nft_auction" USING btree ("auction_contract");--> statement-breakpoint
CREATE INDEX "nft_auction_collection_idx" ON "nft_auction" USING btree ("collection");--> statement-breakpoint
CREATE INDEX "nft_auction_status_idx" ON "nft_auction" USING btree ("status");--> statement-breakpoint
CREATE INDEX "nft_auction_end_time_idx" ON "nft_auction" USING btree ("end_time");--> statement-breakpoint
CREATE INDEX "nft_auction_tx_event_idx" ON "nft_auction" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE INDEX "nft_auction_bid_auction_idx" ON "nft_auction_bid" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "nft_auction_bid_bidder_idx" ON "nft_auction_bid" USING btree ("bidder");--> statement-breakpoint
CREATE INDEX "nft_auction_bid_tx_event_idx" ON "nft_auction_bid" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE INDEX "collection_market_contract" ON "collection" USING btree ("market_contract");--> statement-breakpoint
CREATE INDEX "collection_auction_contract" ON "collection" USING btree ("auction_contract");--> statement-breakpoint
CREATE INDEX "nft_sale_block_height" ON "nft_sale" USING btree ("sale_block_height");--> statement-breakpoint
CREATE INDEX "nft_sale_source_contract" ON "nft_sale" USING btree ("source_contract");--> statement-breakpoint
CREATE INDEX "nft_sale_tx_event_id" ON "nft_sale" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE INDEX "nft_listing_nft_idx" ON "nft_listing" USING btree ("nft");--> statement-breakpoint
CREATE INDEX "nft_listing_market_idx" ON "nft_listing" USING btree ("market_contract");--> statement-breakpoint
CREATE INDEX "nft_listing_tx_event_idx" ON "nft_listing" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE INDEX "nft_bid_nft_idx" ON "nft_bid" USING btree ("nft");--> statement-breakpoint
CREATE INDEX "nft_bid_market_idx" ON "nft_bid" USING btree ("market_contract");--> statement-breakpoint
CREATE INDEX "nft_bid_tx_event_idx" ON "nft_bid" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE INDEX "nft_collection_bid_market_idx" ON "nft_collection_bid" USING btree ("market_contract");--> statement-breakpoint
CREATE INDEX "nft_collection_bid_tx_event_idx" ON "nft_collection_bid" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE INDEX "nft_transfer_nft_idx" ON "nft_transfer" USING btree ("nft_id");--> statement-breakpoint
CREATE INDEX "nft_transfer_tx_event_idx" ON "nft_transfer" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nft_mint_tx_event_unique" ON "nft_mint" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nft_auction_tx_event_unique" ON "nft_auction" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nft_auction_bid_tx_event_unique" ON "nft_auction_bid" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nft_sale_tx_event_unique" ON "nft_sale" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nft_listing_tx_event_unique" ON "nft_listing" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nft_bid_tx_event_unique" ON "nft_bid" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nft_collection_bid_tx_event_unique" ON "nft_collection_bid" USING btree ("transaction_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nft_transfer_tx_event_unique" ON "nft_transfer" USING btree ("transaction_event_id");--> statement-breakpoint
