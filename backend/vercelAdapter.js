const { handleRequest } = require("./server");

function createVercelHandler(basePath = "") {
    return async function handler(request, response) {
        if (basePath) restorePath(request, basePath);
        return handleRequest(request, response);
    };
}

function restorePath(request, basePath) {
    const url = new URL(request.url, "http://blackcrow.local");
    const path = url.searchParams.get("path");
    if (!path) return;

    url.searchParams.delete("path");
    request.url = `${basePath}/${path}${url.search}`;
}

module.exports = { createVercelHandler };
