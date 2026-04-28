const crypto = require("crypto");

const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run hash-password -- <password>");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const key = crypto.scryptSync(password, salt, 64);

console.log(`scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`);
