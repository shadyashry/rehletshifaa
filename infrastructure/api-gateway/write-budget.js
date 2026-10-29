// Whose write budget a request spends (owner decision 2026-10-29, deep validation D-11): a signed-in write counts against
// the user named in its bearer token, an anonymous one against the client address. The gateway cannot verify the token;
// it only reads the subject to choose a bucket. A made-up token buys a fresh bucket but no business: the backend verifies
// every token before anything is done and counts the same user again there, and the per-address connection limit stays.
function writer(r) {
  const header = r.headersIn.Authorization || "";
  const token = /^Bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/.exec(header);
  if (token) {
    try {
      const claims = JSON.parse(Buffer.from(token[2], "base64url").toString());
      if (typeof claims.sub === "string" && claims.sub.length > 0 && claims.sub.length <= 64) return "user:" + claims.sub;
    } catch (e) { /* not a JWT payload: counted by address */ }
  }
  return "ip:" + r.remoteAddress;
}

export default { writer };
