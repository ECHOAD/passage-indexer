# Passage Indexer

Passage Indexer is a powerful and efficient blockchain data processing solution designed specifically for the Passage Marketplace ecosystem. This monorepo houses two main components: a high-performance blockchain indexer and a flexible API for querying the indexed data.

## Key Features

- **Comprehensive Indexing**: Captures and processes all relevant data from Passage Marketplace smart contracts.
- **Real-time Data Access**: Provides up-to-date information through a dedicated API.
- **Scalable Architecture**: Built as a monorepo for easy maintenance and scalability.
- **Efficient Data Storage**: Utilizes PostgreSQL with Drizzle ORM for optimized data management.
- **Developer-Friendly**: Includes detailed setup instructions and Docker support for quick deployment.

Whether you're building dApps, conducting market analysis, or integrating Passage Marketplace data into your projects, Passage Indexer offers a robust foundation for accessing and utilizing blockchain data efficiently.

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```
   pnpm install
   ```
3. Create a postgresql database
4. Set up environment variables (see `.env.sample` files in each app)
5. Build the project:
   ```
   pnpm run dev
   ```

## Project Structure

```
.
├── apps
│   ├── indexer
│   └── api
├── packages
│   └── database
├── docker
└── README.md
```

- `apps/indexer`: The main indexer application
- `apps/api`: API for querying indexed data
- `packages/database`: Shared database package using Drizzle ORM

## Technologies Used

- Node.js
- TypeScript
- PostgreSQL
- Drizzle ORM
- Turbo
- Docker
- Webpack

## Indexer

The indexer is the core application of this project. It processes blockchain data and stores it in a PostgreSQL database using Drizzle ORM.

Key features:
- Indexes blockchain data efficiently
- Uses a caching mechanism for block data
- Supports multiple message types
- Handles validator information

## API

The API provides access to the indexed data stored in the PostgreSQL database. It's built using Hono, a lightweight web framework for Node.js.

## Database

The shared database package uses Drizzle ORM for database operations. It includes schema definitions and utility functions for database interactions.

## Docker

The project includes Docker configurations for both the indexer and API. To build Docker images:

```
pnpm run dc:build
```


## Reindex From Height

This will delete indexed data at and after the given block height, then let the indexer rebuild from that point. By default it also clears the local block cache (use `--keep-cache` to skip that).

Build the indexer first to ensure `dist` exists:

```
pnpm --filter indexer run build
```

Run the reset script:

```
pnpm run indexer:reindex-from -- 1102205
```

Alternative forms:

```
START_HEIGHT=1102205 pnpm run indexer:reindex-from
pnpm run indexer:reindex-from -- 1102205 --keep-cache
```

Docker example:

```
docker compose -f docker-compose.build.yml run --rm indexer node apps/indexer/dist/reindexFromHeight.js 1102205
```

## Development

This project uses Turbo for managing the monorepo. Common commands:

- `pnpm run dev`: Run all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run lint`: Lint all applications
- `pnpm run db:check`: Check database schema
- `pnpm run db:generate`: Generate database migrations

## Contributing

Contributions are welcome! Please read our contributing guidelines and code of conduct before submitting pull requests. Please refer to the guidelines outlined in the [CONTRIBUTING.md](./CONTRIBUTING.md) file.

## License

This project is licensed under the [Apache License 2.0](./LICENSE).