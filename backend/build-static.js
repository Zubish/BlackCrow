const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const output = path.join(root, "public");
const files = [
    "activity.html",
    "create-escrow.html",
    "dispute-policy.html",
    "index.html",
    "landingpage.html",
    "login.html",
    "overview.html",
    "privacy.html",
    "quick-escrow.html",
    "reset-password.html",
    "script.js",
    "signup.html",
    "style.css",
    "terms.html",
    "track-escrow.html",
    "transactions.html",
    "user.html",
    "wallet.html"
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

files.forEach((file) => {
    fs.copyFileSync(path.join(root, file), path.join(output, file));
});

fs.cpSync(path.join(root, "images"), path.join(output, "images"), { recursive: true });

console.log(`Copied ${files.length} frontend files to public/.`);
