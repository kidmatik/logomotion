/**
 * Fetch a public web page on the user's behalf without letting the request
 * reach our own network: every hop (including redirects) must resolve to a
 * public address, responses are size-capped and time-limited.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 4;

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

function privateV6(ip: string) {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::" || s === "::1") return true;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
}

export function isPrivateAddress(ip: string) {
  return isIP(ip) === 6 ? privateV6(ip) : privateV4(ip);
}

export class FetchError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

async function assertPublic(url: URL) {
  if (!/^https?:$/.test(url.protocol)) throw new FetchError("Only http(s) links can be read.", 400);
  if (url.port && !["80", "443"].includes(url.port)) throw new FetchError("Only standard web ports can be read.", 400);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/(^localhost$|\.local$|\.internal$|\.localhost$)/i.test(host)) throw new FetchError("Only public pages can be read.", 400);
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new FetchError("We couldn't find that website. Check the address.", 400);
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new FetchError("Only public pages can be read.", 400);
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 LogoMotionBrandReader/1.0";

export interface Fetched {
  url: URL;
  type: string;
  body: Uint8Array;
}

/** GET a public URL, following redirects by hand so each hop is checked. */
export async function safeFetch(input: string | URL, opts: { maxBytes?: number; timeoutMs?: number; accept?: string } = {}): Promise<Fetched> {
  const { maxBytes = 2_000_000, timeoutMs = 8000, accept = "*/*" } = opts;
  let url = new URL(input);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublic(url);
      let res: Response;
      try {
        res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": UA, accept, "accept-language": "en,he;q=0.8" } });
      } catch {
        throw new FetchError(ctrl.signal.aborted ? "The website took too long to answer." : "The website didn't answer.");
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      if (!res.ok) throw new FetchError(`The website answered with an error (${res.status}).`);
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > maxBytes) throw new FetchError("That file is too big to read.");
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            reader.cancel().catch(() => undefined);
            break;
          }
          chunks.push(value);
        }
      }
      const body = new Uint8Array(Math.min(size, maxBytes));
      let o = 0;
      for (const c of chunks) {
        body.set(c.subarray(0, body.length - o), o);
        o += c.byteLength;
        if (o >= body.length) break;
      }
      return { url, type: res.headers.get("content-type") ?? "", body };
    }
    throw new FetchError("The website redirected too many times.");
  } finally {
    clearTimeout(timer);
  }
}

export function text(f: Fetched) {
  return new TextDecoder("utf-8", { fatal: false }).decode(f.body);
}
