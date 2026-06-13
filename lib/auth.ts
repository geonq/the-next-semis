import { SignJWT, jwtVerify } from "jose";

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (value) return new TextEncoder().encode(value);
  // Only ever fall back to a known dev secret in true local development. Vercel
  // preview AND production both run NODE_ENV=production, so a missing JWT_SECRET
  // there is a hard error rather than a silently-forgeable token.
  if (process.env.NODE_ENV !== "development") {
    throw new Error("JWT_SECRET is required outside local development.");
  }
  return new TextEncoder().encode("dev-secret-change-me-in-production");
}

export async function signSession(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "admin";
  } catch {
    return false;
  }
}
