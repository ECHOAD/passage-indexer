CREATE TYPE "public"."block_event_source" AS ENUM('begin_block_events', 'end_block_events');--> statement-breakpoint
CREATE TABLE "address_reference" (
	"id" serial PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"message_id" uuid,
	"address" varchar(255) NOT NULL,
	"type" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block" (
	"height" integer PRIMARY KEY NOT NULL,
	"datetime" timestamp NOT NULL,
	"hash" varchar(255) NOT NULL,
	"proposer" varchar(255) NOT NULL,
	"day_id" uuid NOT NULL,
	"tx_count" integer NOT NULL,
	"is_processed" boolean DEFAULT false NOT NULL,
	"total_tx_count" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"height" integer NOT NULL,
	"source" "block_event_source" NOT NULL,
	"index" integer NOT NULL,
	"type" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_event_attribute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_event_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"key" varchar(255) NOT NULL,
	"value" text
);
--> statement-breakpoint
CREATE TABLE "day" (
	"id" uuid PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"token_price" double precision,
	"first_block_height" integer NOT NULL,
	"last_block_height" integer,
	"last_block_height_yet" integer NOT NULL,
	"token_price_changed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tx_id" uuid NOT NULL,
	"height" integer NOT NULL,
	"type" varchar(255) NOT NULL,
	"type_category" varchar(255) NOT NULL,
	"index" integer NOT NULL,
	"index_in_block" integer NOT NULL,
	"is_processed" boolean DEFAULT false NOT NULL,
	"is_notification_processed" boolean DEFAULT false NOT NULL,
	"amount" numeric,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitored_value" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tracker" varchar(255) NOT NULL,
	"target" varchar(255) NOT NULL,
	"value" varchar(255),
	"last_update_date" timestamp
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hash" varchar(255) NOT NULL,
	"index" integer NOT NULL,
	"height" integer NOT NULL,
	"msg_count" integer NOT NULL,
	"multisig_threshold" integer,
	"gas_used" integer NOT NULL,
	"gas_wanted" integer NOT NULL,
	"fee" bigint NOT NULL,
	"memo" text NOT NULL,
	"is_processed" boolean DEFAULT false NOT NULL,
	"has_processing_error" boolean DEFAULT false NOT NULL,
	"log" text
);
--> statement-breakpoint
CREATE TABLE "transaction_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"height" integer NOT NULL,
	"tx_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"type" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_event_attribute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_event_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"key" varchar(255) NOT NULL,
	"value" text
);
--> statement-breakpoint
CREATE TABLE "validator" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_address" varchar(255) NOT NULL,
	"account_address" varchar(255) NOT NULL,
	"hex_address" varchar(255) NOT NULL,
	"created_msg_id" uuid,
	"moniker" varchar(255) NOT NULL,
	"identity" varchar(255),
	"website" varchar(255),
	"description" text,
	"security_contact" varchar(255),
	"rate" numeric NOT NULL,
	"max_rate" numeric NOT NULL,
	"max_change_rate" numeric NOT NULL,
	"min_self_delegation" bigint NOT NULL,
	"keybase_username" varchar(255),
	"keybase_avatar_url" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"address" varchar(255) PRIMARY KEY NOT NULL,
	"created_height" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"symbol" varchar(255) NOT NULL,
	"mint_contract" varchar(255),
	"market_contract" varchar(255),
	"minter" varchar(255) NOT NULL,
	"creator" varchar(255) NOT NULL,
	"description" varchar NOT NULL,
	"image" varchar NOT NULL,
	"external_link" varchar NOT NULL,
	"royalty_address" varchar(255),
	"royalty_fee" numeric,
	"max_num_token" integer,
	"per_address_limit" integer,
	"whitelist" uuid,
	"start_time" timestamp with time zone,
	"unit_price" numeric,
	"unit_denom" varchar(255),
	"collector_address" varchar(255),
	"trading_fee_bps" numeric,
	"min_price" numeric
);
--> statement-breakpoint
CREATE TABLE "nft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" integer NOT NULL,
	"owner" varchar(255),
	"image" varchar(255),
	"name" varchar(255),
	"description" varchar(1000),
	"external_url" varchar(255),
	"background_color" varchar(255),
	"animation_url" varchar(255),
	"youtube_url" varchar(255),
	"metadata" json NOT NULL,
	"created_on_block_height" integer,
	"minted_on_block_height" integer,
	"airdropped_on_block_height" integer,
	"migrated_on_block_height" integer,
	"mint_price" numeric,
	"mint_denom" varchar(255),
	"collection" varchar(255),
	"active_listing_id" uuid
);
--> statement-breakpoint
CREATE TABLE "nft_sale" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"previous_owner" varchar(255) NOT NULL,
	"new_owner" varchar(255) NOT NULL,
	"nft" uuid NOT NULL,
	"sale_price" numeric NOT NULL,
	"sale_denom" varchar(255) NOT NULL,
	"sale_block_height" integer NOT NULL,
	"market_fee" numeric NOT NULL,
	"market_fee_denom" varchar NOT NULL,
	"royalty_fee" numeric NOT NULL,
	"royalty_fee_denom" varchar NOT NULL,
	"royalty_fee_address" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nft_bid" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" varchar(255) NOT NULL,
	"nft" uuid NOT NULL,
	"bid_price" numeric,
	"bid_denom" varchar(255),
	"bid_block_height" integer,
	"removed_block_height" integer
);
--> statement-breakpoint
CREATE TABLE "nft_collection_bid" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" varchar(255) NOT NULL,
	"collection" varchar(255) NOT NULL,
	"units" integer,
	"funds_amount" numeric,
	"funds_denom" varchar(255),
	"bid_price" numeric,
	"bid_denom" varchar(255),
	"bid_block_height" integer,
	"removed_block_height" integer
);
--> statement-breakpoint
CREATE TABLE "nft_listing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" varchar(255) NOT NULL,
	"nft" uuid NOT NULL,
	"for_sale_price" numeric,
	"for_sale_denom" varchar(255),
	"for_sale_block_height" integer,
	"unlisted_block_height" integer
);
--> statement-breakpoint
CREATE TABLE "nft_transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_owner" varchar(255) NOT NULL,
	"to_owner" varchar(255) NOT NULL,
	"transferred_on_block_height" integer NOT NULL,
	"nft_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whitelist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin" varchar(255) NOT NULL,
	"address" varchar(255) NOT NULL,
	"collection" varchar(255) NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"member_limit" integer NOT NULL,
	"num_members" integer NOT NULL,
	"per_address_limit" integer NOT NULL,
	"unit_price" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whitelist_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address" varchar(255) NOT NULL,
	"whitelist" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nft_to_trait" (
	"nft_id" uuid NOT NULL,
	"trait_id" uuid NOT NULL,
	CONSTRAINT "nft_to_trait_nft_id_trait_id_pk" PRIMARY KEY("nft_id","trait_id")
);
--> statement-breakpoint
CREATE TABLE "nft_trait" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection" varchar(255),
	"display_type" varchar(255),
	"trait_type" varchar(255),
	"trait_value" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "address_reference" ADD CONSTRAINT "address_reference_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "address_reference" ADD CONSTRAINT "address_reference_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "block" ADD CONSTRAINT "block_day_id_day_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."day"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_event" ADD CONSTRAINT "block_event_height_block_height_fk" FOREIGN KEY ("height") REFERENCES "public"."block"("height") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_event_attribute" ADD CONSTRAINT "block_event_attribute_block_event_id_block_event_id_fk" FOREIGN KEY ("block_event_id") REFERENCES "public"."block_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_tx_id_transaction_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."transaction"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_height_block_height_fk" FOREIGN KEY ("height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_height_block_height_fk" FOREIGN KEY ("height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_event" ADD CONSTRAINT "transaction_event_height_block_height_fk" FOREIGN KEY ("height") REFERENCES "public"."block"("height") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_event" ADD CONSTRAINT "transaction_event_tx_id_transaction_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."transaction"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_event_attribute" ADD CONSTRAINT "transaction_event_attribute_transaction_event_id_transaction_event_id_fk" FOREIGN KEY ("transaction_event_id") REFERENCES "public"."transaction_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_whitelist_whitelist_id_fk" FOREIGN KEY ("whitelist") REFERENCES "public"."whitelist"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft" ADD CONSTRAINT "nft_created_on_block_height_block_height_fk" FOREIGN KEY ("created_on_block_height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft" ADD CONSTRAINT "nft_minted_on_block_height_block_height_fk" FOREIGN KEY ("minted_on_block_height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft" ADD CONSTRAINT "nft_airdropped_on_block_height_block_height_fk" FOREIGN KEY ("airdropped_on_block_height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft" ADD CONSTRAINT "nft_migrated_on_block_height_block_height_fk" FOREIGN KEY ("migrated_on_block_height") REFERENCES "public"."block"("height") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft" ADD CONSTRAINT "nft_collection_collection_address_fk" FOREIGN KEY ("collection") REFERENCES "public"."collection"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_sale" ADD CONSTRAINT "nft_sale_nft_nft_id_fk" FOREIGN KEY ("nft") REFERENCES "public"."nft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nft_sale" ADD CONSTRAINT "nft_sale_sale_block_height_block_height_fk" FOREIGN KEY ("sale_block_height") REFERENCES "public"."block"("height") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nft_bid" ADD CONSTRAINT "nft_bid_nft_nft_id_fk" FOREIGN KEY ("nft") REFERENCES "public"."nft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nft_bid" ADD CONSTRAINT "nft_bid_bid_block_height_block_height_fk" FOREIGN KEY ("bid_block_height") REFERENCES "public"."block"("height") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nft_bid" ADD CONSTRAINT "nft_bid_removed_block_height_block_height_fk" FOREIGN KEY ("removed_block_height") REFERENCES "public"."block"("height") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nft_collection_bid" ADD CONSTRAINT "nft_collection_bid_collection_collection_address_fk" FOREIGN KEY ("collection") REFERENCES "public"."collection"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_collection_bid" ADD CONSTRAINT "nft_collection_bid_bid_block_height_block_height_fk" FOREIGN KEY ("bid_block_height") REFERENCES "public"."block"("height") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nft_collection_bid" ADD CONSTRAINT "nft_collection_bid_removed_block_height_block_height_fk" FOREIGN KEY ("removed_block_height") REFERENCES "public"."block"("height") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nft_listing" ADD CONSTRAINT "nft_listing_nft_nft_id_fk" FOREIGN KEY ("nft") REFERENCES "public"."nft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nft_listing" ADD CONSTRAINT "nft_listing_for_sale_block_height_block_height_fk" FOREIGN KEY ("for_sale_block_height") REFERENCES "public"."block"("height") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nft_listing" ADD CONSTRAINT "nft_listing_unlisted_block_height_block_height_fk" FOREIGN KEY ("unlisted_block_height") REFERENCES "public"."block"("height") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nft_transfer" ADD CONSTRAINT "nft_transfer_nft_id_nft_id_fk" FOREIGN KEY ("nft_id") REFERENCES "public"."nft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whitelist_member" ADD CONSTRAINT "whitelist_member_whitelist_whitelist_id_fk" FOREIGN KEY ("whitelist") REFERENCES "public"."whitelist"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_to_trait" ADD CONSTRAINT "nft_to_trait_nft_id_nft_id_fk" FOREIGN KEY ("nft_id") REFERENCES "public"."nft"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_to_trait" ADD CONSTRAINT "nft_to_trait_trait_id_nft_trait_id_fk" FOREIGN KEY ("trait_id") REFERENCES "public"."nft_trait"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nft_trait" ADD CONSTRAINT "nft_trait_collection_collection_address_fk" FOREIGN KEY ("collection") REFERENCES "public"."collection"("address") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "address_reference_transaction_id" ON "address_reference" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "address_reference_address" ON "address_reference" USING btree ("address");--> statement-breakpoint
CREATE INDEX "block_datetime" ON "block" USING btree ("datetime");--> statement-breakpoint
CREATE INDEX "block_day_id" ON "block" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "block_height_is_processed" ON "block" USING btree ("height","is_processed");--> statement-breakpoint
CREATE INDEX "block_height_where_is_processed_false" ON "block" USING btree ("height") WHERE is_processed = false;--> statement-breakpoint
CREATE INDEX "block_event_height_index" ON "block_event" USING btree ("height");--> statement-breakpoint
CREATE INDEX "block_event_attribute_block_event_id_index" ON "block_event_attribute" USING btree ("block_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "day_date" ON "day" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "day_first_block_height" ON "day" USING btree ("first_block_height");--> statement-breakpoint
CREATE UNIQUE INDEX "day_last_block_height" ON "day" USING btree ("last_block_height");--> statement-breakpoint
CREATE INDEX "message_tx_id" ON "message" USING btree ("tx_id");--> statement-breakpoint
CREATE INDEX "message_height" ON "message" USING btree ("height");--> statement-breakpoint
CREATE INDEX "message_tx_id_is_processed" ON "message" USING btree ("tx_id","is_processed");--> statement-breakpoint
CREATE INDEX "message_height_is_notification_processed" ON "message" USING btree ("height","is_notification_processed");--> statement-breakpoint
CREATE INDEX "message_height_is_notification_processed_false" ON "message" USING btree ("height");--> statement-breakpoint
CREATE INDEX "message_height_is_notification_processed_true" ON "message" USING btree ("height");--> statement-breakpoint
CREATE UNIQUE INDEX "monitored_value_tracker_target" ON "monitored_value" USING btree ("tracker","target");--> statement-breakpoint
CREATE INDEX "transaction_height" ON "transaction" USING btree ("height");--> statement-breakpoint
CREATE INDEX "transaction_height_is_processed_has_processing_error" ON "transaction" USING btree ("height","is_processed","has_processing_error");--> statement-breakpoint
CREATE INDEX "transaction_hash" ON "transaction" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "transaction_id_has_procesing_error_false" ON "transaction" USING btree ("id");--> statement-breakpoint
CREATE INDEX "transaction_event_height_index" ON "transaction_event" USING btree ("height","index");--> statement-breakpoint
CREATE INDEX "transaction_event_tx_id_index" ON "transaction_event" USING btree ("tx_id","index");--> statement-breakpoint
CREATE INDEX "transaction_event_attribute_transaction_event_id_index" ON "transaction_event_attribute" USING btree ("transaction_event_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "validator_id" ON "validator" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "validator_operator_address" ON "validator" USING btree ("operator_address");--> statement-breakpoint
CREATE UNIQUE INDEX "validator_account_address" ON "validator" USING btree ("account_address");--> statement-breakpoint
CREATE UNIQUE INDEX "validator_hex_address" ON "validator" USING btree ("hex_address");--> statement-breakpoint
CREATE INDEX "collection_min_contract" ON "collection" USING btree ("mint_contract");--> statement-breakpoint
CREATE UNIQUE INDEX "nft_collection_token_id" ON "nft" USING btree ("collection","token_id");--> statement-breakpoint
CREATE INDEX "nft_minted_on_block_height" ON "nft" USING btree ("minted_on_block_height");--> statement-breakpoint
CREATE INDEX "nft_owner" ON "nft" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "nft_sale_nft" ON "nft_sale" USING btree ("nft");--> statement-breakpoint
CREATE UNIQUE INDEX "nft_bid_owner_nft_where_removed_block_height_null" ON "nft_bid" USING btree ("owner","nft") WHERE "nft_bid"."removed_block_height" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "nft_collection_bid_owner_collection_where_removed_block_height_null" ON "nft_collection_bid" USING btree ("owner","collection") WHERE "nft_collection_bid"."removed_block_height" is null;--> statement-breakpoint
CREATE INDEX "whitelist_collection" ON "whitelist" USING btree ("collection");--> statement-breakpoint
CREATE INDEX "whitelist_member_address" ON "whitelist_member" USING btree ("address");--> statement-breakpoint
CREATE INDEX "nft_trait_collection" ON "nft_trait" USING btree ("collection");