# Mutatio

A database migration solution for use with the libSQL client in Node

**Installation**

```
npm install @deadcode-uk/mutatio
```

**Peer Dependencies**

Your project will need to include the following packages:

```
@libsql/client
dotenv
```

**Environment Variables**

Mutatio depends on the following environment variables being available:

```
DATABASE_URL            // required
DATABASE_AUTH_TOKEN     // required for hosted databases, e.g. Turso
DATABASE_ENCRYPTION_KEY // optional
```

These variables should be in a `.env` file in the project root directory, they are used to create a libSQL client when applying and reverting migrations

## Opinionated

Mutatio has primarily been created for my own use in projects that use libSQL, so it is opinionated for consistency reasons

Database migrations will be created in a `migrations` directory in the project root

```
/migrations <- migrations live in this directory
/node_modules
/src
/readme.md
/package.json
```

Migration files are JavaScript modules that export two functions, `apply` and `revert`, both of which must return a `Promise`

```js
import { sqlite } from "@deadcode-uk/archivum"

/**
 * @param {import("@libsql/client").Client} client
 * @returns {Promise<void>}
 */
export async function apply(client) {
    await client.execute(sqlite`
        CREATE TABLE example (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at INTEGER DEFAULT (unixepoch()),
            updated_at INTEGER DEFAULT (unixepoch())
        )
    `)
}

/**
 * @param {import("@libsql/client").Client} client
 * @returns {Promise<void>}
 */
export async function revert(client) {
    await client.execute(sqlite`
        DROP TABLE IF EXISTS example
    `)
}
```

You can do whatever you need to do in those functions to apply migrations and revert migrations

Within your database, a table called `migrations` will be created the first time migrations are applied, and will be used to track which migrations have been applied

## Create a Migration

Use the following command to create a migration, where `<migration-name>` is the name of the migration to create:

```
npx mutatio create <migration-name>
```

For example, `npx mutatio create add-core-tables` would create a file similar to this:

```
/migrations/20250706123456-add-core-tables.js
```

File names can contain alpha-numeric characters and dashes. The name will be converted to lowercase automatically, dashes will be removed from the start and end of the name, and multiple dashes will be collapsed

An error will be thrown if the name is invalid or if the generated filename conflicts with an existing one

## Apply Migrations

Use the following command to apply pending migrations:

```
npx mutatio apply
```

## Revert a Migration

Use the following command to revert the latest batch of migrations that were applied with the `apply` command:

```
npx mutatio revert
```

## Post Install

You will more than likely want to apply migrations after the `npm install` command has been run, either locally or during a deployment. That is easy enough to setup in your `package.json` file:

```
{
    "scripts": {
        "postinstall": "npx mutatio apply",
        ...
    }
}
```
