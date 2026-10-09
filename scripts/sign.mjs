// Build a signed URL path: node scripts/sign.mjs <secret> "/c/w=200/images/1.jpg"
import { createHmac } from "node:crypto";

const [secret, path] = process.argv.slice(2);
if (!secret || !path) {
  console.error('usage: node scripts/sign.mjs <signing-secret> "/w=200/images/1.jpg"');
  process.exit(1);
}
const sig = "1." + createHmac("sha256", secret).update(path).digest("base64url");
const m = /^(\/c!?)?\/([^/]*=[^/]*)(\/.*)$/.exec(path);
// Insert sig at the start of the parameter section (/c/sig=.../path if there are no parameters)
const signed = m ? `${m[1] ?? ""}/sig=${sig},${m[2]}${m[3]}` : `/c/sig=${sig}${path}`;
console.log(signed);
