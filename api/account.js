const { handleRequest } = require("../backend/server");

module.exports = async function handler(request, response) {
    restorePath(request, "/api/account");
    return handleRequest(request, response);
};

function restorePath(request, basePath) {
    const url = new URL(request.url, "http://blackcrow.local");
    const path = url.searchParams.get("path");
    if (!path) return;
    url.searchParams.delete("path");
    request.url = `${basePath}/${path}${url.search}`;
}
