const { handleRequest } = require("../../../../backend/server");

module.exports = async function handler(request, response) {
    return handleRequest(request, response);
};
