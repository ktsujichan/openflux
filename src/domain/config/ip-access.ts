import * as z from "zod";

const ipv4ToInt = (ip: string): number | undefined => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return undefined;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return undefined;
  return parts.reduce((acc, n) => ((acc << 8) | n) >>> 0, 0);
};

/** An RFC 4632 CIDR (IPv4). CIDRs with bits set outside the mask are invalid. */
const CidrSchema = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const [base = "", bitsStr] = s.split("/");
    const bits = bitsStr === undefined ? 32 : Number(bitsStr);
    const addr = ipv4ToInt(base);
    if (addr === undefined || !Number.isInteger(bits) || bits < 0 || bits > 32) {
      ctx.addIssue({ code: "custom", message: `invalid CIDR: ${s}` });
      return z.NEVER;
    }
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((addr & mask) >>> 0 !== addr) {
      ctx.addIssue({ code: "custom", message: `host bits must be zero: ${s}` });
      return z.NEVER;
    }
    return { base: addr, mask };
  });

const IpAccessSchema = z.object({
  mode: z.enum(["allow", "deny"]),
  list: z.array(CidrSchema),
});

/** Allow list / deny list by IPv4 address or CIDR. */
export type IpAccess = Readonly<z.output<typeof IpAccessSchema>>;

export const IpAccess = {
  schema: IpAccessSchema,

  /** Addresses the list cannot express (e.g. IPv6) are denied by an allow list and allowed by a deny list. */
  allows: (acl: IpAccess | undefined, ip: string | null): boolean => {
    if (!acl) return true;
    const addr = ip === null ? undefined : ipv4ToInt(ip);
    const listed = addr !== undefined && acl.list.some((c) => (addr & c.mask) >>> 0 === c.base);
    return acl.mode === "allow" ? listed : !listed;
  },
} as const;
