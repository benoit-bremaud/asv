/**
 * BR-112 (issue #38): the key of every per-IP quota, cap and ban. An IPv6 address is keyed by its /64 prefix,
 * since one subscriber holds a whole /64; an IPv4 address (IPv4-mapped IPv6 included) is keyed as is.
 * The connection line keeps the full address (BR-060).
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET = /^[0-9a-f]{1,4}$/;

const isIpv4 = (text: string): boolean => {
  const match = IPV4.exec(text);
  return match !== null && match.slice(1).every((part) => Number(part) <= 255);
};

/** The hextets of an IPv6 address written in full, compressed or with a dotted tail; `undefined` when invalid. */
const hextets = (address: string): string[] | undefined => {
  const halves = address.split("::");
  if (halves.length > 2) return undefined;
  const expand = (half: string, last: boolean): string[] | undefined => {
    if (half === "") return [];
    const parts = half.split(":");
    const tail = parts[parts.length - 1] ?? "";
    if (tail.includes(".")) {
      if (!last || !isIpv4(tail)) return undefined;
      const [a = 0, b = 0, c = 0, d = 0] = tail.split(".").map(Number);
      parts.splice(-1, 1, ((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
    }
    return parts.every((part) => HEXTET.test(part)) ? parts : undefined;
  };
  const head = expand(halves[0] ?? "", halves.length === 1);
  const tail = halves.length === 2 ? expand(halves[1] ?? "", true) : [];
  if (head === undefined || tail === undefined) return undefined;
  if (halves.length === 1) return head.length === 8 ? head : undefined;
  const missing = 8 - head.length - tail.length;
  return missing < 1 ? undefined : [...head, ...Array<string>(missing).fill("0"), ...tail];
};

/** The quota and ban key of `ip`; anything that is not an IP address is returned unchanged. */
export const quotaKey = (ip: string): string => {
  const address = ip.trim().toLowerCase().replace(/%.*$/, "");
  if (isIpv4(address)) return address;
  if (!address.includes(":")) return ip;
  const groups = hextets(address);
  if (groups === undefined) return ip;
  const [a = "0", b = "0", c = "0", d = "0", e = "0", f = "0", g = "0", h = "0"] = groups.map((group) => group.replace(/^0+(?=.)/, ""));
  if ([a, b, c, d, e].every((group) => group === "0") && f === "ffff") {
    const high = Number.parseInt(g, 16);
    const low = Number.parseInt(h, 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return `${a}:${b}:${c}:${d}::/64`;
};
