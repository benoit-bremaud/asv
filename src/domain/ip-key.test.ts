import { describe, expect, it } from "vitest";
import { quotaKey } from "./ip-key";

describe("quotaKey (BR-112)", () => {
  it("keeps an IPv4 address as is", () => {
    expect(quotaKey("203.0.113.7")).toBe("203.0.113.7");
  });

  it("keys a full IPv6 address by its /64 prefix", () => {
    expect(quotaKey("2001:0db8:0000:0001:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:0:1::/64");
  });

  it("gives every address of one /64 the same key and another /64 another key", () => {
    expect(quotaKey("2001:db8:0:1::1")).toBe(quotaKey("2001:db8:0:1:ffff:ffff:ffff:ffff"));
    expect(quotaKey("2001:db8:0:1::1")).not.toBe(quotaKey("2001:db8:0:2::1"));
  });

  it("handles compressed forms, leading and trailing", () => {
    expect(quotaKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(quotaKey("::1")).toBe("0:0:0:0::/64");
    expect(quotaKey("::")).toBe("0:0:0:0::/64");
    expect(quotaKey("2001:db8:1:2:3:4::")).toBe("2001:db8:1:2::/64");
    expect(quotaKey("2001:DB8::1")).toBe("2001:db8:0:0::/64");
  });

  it("treats an IPv4-mapped address as that IPv4 address", () => {
    expect(quotaKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(quotaKey("::FFFF:cb00:7107")).toBe("203.0.113.7");
    expect(quotaKey("0:0:0:0:0:ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("drops a zone id", () => {
    expect(quotaKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it.each(["", "unknown", "1.2.3", "999.1.1.1", "2001:db8::1::2", "2001:zzzz::1", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9", "::ffff:1.2.3.999", "1:2:3:4::5:6:7:8", "1.2.3.4::", "1.2.3.4::1"])(
    "returns invalid input %j unchanged",
    (input) => {
      expect(quotaKey(input)).toBe(input);
    },
  );
});
