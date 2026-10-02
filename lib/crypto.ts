import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

function key(purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}:${env().SESSION_SECRET}`).digest();
}

/** AES-256-GCM encryption for secrets stored in MongoDB (OAuth tokens). */
export function encrypt(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("enc"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string {
  if (!payload) return "";
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key("enc"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Signs a value as `value.signature` (HMAC-SHA256). */
export function sign(value: string): string {
  const sig = createHmac("sha256", key("sig")).update(value).digest("base64url");
  return `${value}.${sig}`;
}

export function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const expected = Buffer.from(sign(value).slice(idx + 1));
  const actual = Buffer.from(signed.slice(idx + 1));
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? value : null;
}
