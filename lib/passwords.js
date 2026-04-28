const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

function timingSafeEqualString(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function verifyPassword(input, stored) {
  if (!stored) return false;
  if (stored.startsWith("scrypt$")) {
    const [, salt, expected] = stored.split("$");
    if (!salt || !expected) return false;
    const expectedBuffer = Buffer.from(expected, "base64url");
    const actualBuffer = crypto.scryptSync(input, Buffer.from(salt, "base64url"), expectedBuffer.length);
    return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  }
  return timingSafeEqualString(input, stored);
}

module.exports = { hashPassword, verifyPassword };
