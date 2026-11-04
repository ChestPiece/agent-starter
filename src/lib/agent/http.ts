// Request trust helpers shared by the API routes.

// ponytail: same-origin only while the chat page is ours. An embeddable widget needs an allowed-origins list instead.
export const sameOrigin = (req: Request) => {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false; // "null" (sandboxed frame) or junk
  }
};

// Vercel sets x-forwarded-for itself, so the first entry is the caller. Behind another proxy, check what it sends.
export const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
