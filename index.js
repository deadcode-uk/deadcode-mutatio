#!/usr/bin/env node

import { createClient } from "@libsql/client"
import { existsSync } from "node:fs"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import "dotenv/config"

const migrationTemplate = `
/**
 * @param {import("@libsql/client").Client} client
 * @returns {Promise<void>}
 */
export async function apply(client) {
    //
}

/**
 * @param {import("@libsql/client").Client} client
 * @returns {Promise<void>}
 */
export async function revert(client) {
    //
}
`

const client = createClient({
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
    encryptionKey: process.env.DATABASE_ENCRYPTION_KEY
})

/**
 * @returns {Promise<void>}
 */
async function requireMigrationsDirectory() {
    await mkdir("migrations", { recursive: true })
}

/**
 * @returns {Promise<void>}
 */
async function requireMigrationsTable() {
    try {
        await client.execute("SELECT id FROM migrations LIMIT 1")
        return
    } catch (error) {
        if (error.message.includes("no such table") === false) {
            console.error(error)
            process.exit(1)
        }
    }

    await client.execute(`
        CREATE TABLE migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            collection INTEGER NOT NULL
        )
    `)
}

/**
 * @param {string} name
 * @returns {Promise<void>}
 */
async function createMigration(name) {
    await requireMigrationsDirectory()

    name = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .replace(/^-+|-+$/g, "")
        .replace(/-{,2}/g, "-")

    if (name.length < 1) {
        console.error("The migration name must be at least 1 character long")
        process.exit(1)
    }

    const date = new Date()
    const iso = date.toISOString()
    const prefix = iso.substring(0, 19).replace(/[-T:]/g, "")
    const filename = `${prefix}-${name}.js`
    const filepath = `migrations/${filename}`

    if (existsSync(filepath)) {
        console.error(`The migration file "${filename}" already exists`)
        process.exit(1)
    }

    await writeFile(filepath, migrationTemplate.trimStart())

    console.log(`Created migration file: ${filename}`)
}

/**
 * @returns {Promise<void>}
 */
async function applyMigrations() {
    await requireMigrationsDirectory()
    await requireMigrationsTable()

    let collection = 1

    let result = await client.execute(
        "SELECT collection FROM migrations ORDER BY collection DESC LIMIT 1"
    )

    if (result.rows > 0) {
        collection = result.rows[0].collection + 1
    }

    result = await client.execute("SELECT filename FROM migrations ORDER BY filename ASC")

    const remoteFiles = result.rows.map((row) => {
        return row.filename
    })

    const localFiles = await readdir("migrations")

    localFiles.sort((a, b) => a.localeCompare(b))

    const pendingFiles = localFiles.filter((filename) => {
        return remoteFiles.includes(filename) === false
    })

    for (const filename of pendingFiles) {
        const filepath = resolve(`migrations/${filename}`)
        const migration = await import(filepath)

        if (typeof migration.apply !== "function") {
            console.error(`No "apply" function has been exported from migration: ${filename}`)
            process.exit(1)
        }

        await migration.apply(client)

        await client.execute({
            sql: "INSERT INTO migrations ( filename, collection ) VALUES ( ?, ? )",
            args: [filename, collection]
        })

        console.log(`Applied migration: ${filename}`)
    }
}

/**
 * @returns {Promise<void>}
 */
async function revertMigrations() {
    await requireMigrationsDirectory()
    await requireMigrationsTable()

    let collection = 0

    let result = await client.execute(
        "SELECT collection FROM migrations ORDER BY collection DESC LIMIT 1"
    )

    if (result.rows.length > 0) {
        collection = result.rows[0].collection
    }

    result = await client.execute({
        sql: "SELECT * FROM migrations WHERE collection = ? ORDER BY filename DESC",
        args: [collection]
    })

    for (const row of result.rows) {
        const filepath = resolve(`migrations/${row.filename}`)
        const migration = await import(filepath)

        if (typeof migration.revert !== "function") {
            console.error(`No "revert" function has been exported from migration: ${filename}`)
            process.exit(1)
        }

        await migration.revert(client)

        await client.execute({
            sql: "DELETE FROM migrations WHERE id = ?",
            args: [row.id]
        })

        console.log(`Reverted migration: ${row.filename}`)
    }
}

/**
 * @returns {Promise<void>}
 */
async function main() {
    const command = process.argv[2]
    const value = process.argv[3]

    if (command === "apply") {
        await applyMigrations()
        return
    }

    if (command === "create") {
        if (value === undefined) {
            console.error("Please provide a migration name")
            process.exit(1)
        }

        await createMigration(value)
        return
    }

    if (command === "revert") {
        await revertMigrations()
        return
    }
}

await main()
