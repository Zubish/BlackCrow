const fs = require("fs");
const path = require("path");

loadEnv();

async function runMigration() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required to run database migrations.");
    }

    let Client;
    try {
        ({ Client } = require("pg"));
    } catch (error) {
        throw new Error("The pg package is not installed. Run npm install before migrating.");
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    });

    await client.connect();
    try {
        const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
        await client.query(schema);
        console.log("Database schema is ready.");
    } finally {
        await client.end();
    }
}

function loadEnv() {
    const envPath = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(envPath)) return;

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) return;

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    });
}

runMigration().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
