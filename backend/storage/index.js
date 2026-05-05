const { createFileStore } = require("./fileStore");
const { createPostgresStore } = require("./postgresStore");

async function createStorage() {
    if (process.env.DATABASE_URL) {
        return createPostgresStore();
    }

    return createFileStore();
}

module.exports = { createStorage };
