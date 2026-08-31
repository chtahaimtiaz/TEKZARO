import { describe, it, expect } from "vitest";
import { isPrivateIPv4, isPrivateIPv6, isPrivateAddress } from "../lib/security/ip-guard";

describe("isPrivateIPv4", () => {
  it("flags RFC1918 private ranges", () => {
    expect(isPrivateIPv4("10.0.0.1")).toBe(true);
    expect(isPrivateIPv4("172.16.5.5")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
    expect(isPrivateIPv4("192.168.1.1")).toBe(true);
  });

  it("flags loopback, link-local and CGNAT", () => {
    expect(isPrivateIPv4("127.0.0.1")).toBe(true);
    expect(isPrivateIPv4("169.254.1.1")).toBe(true);
    expect(isPrivateIPv4("100.64.0.1")).toBe(true);
  });

  it("does not flag ordinary public addresses", () => {
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("172.15.0.1")).toBe(false); // just outside 172.16/12
    expect(isPrivateIPv4("172.32.0.1")).toBe(false); // just outside 172.16/12
    expect(isPrivateIPv4("1.1.1.1")).toBe(false);
  });

  it("fails closed on unparsable input", () => {
    expect(isPrivateIPv4("not-an-ip")).toBe(true);
    expect(isPrivateIPv4("999.999.999.999")).toBe(true);
  });
});

describe("isPrivateIPv6", () => {
  it("flags loopback, unique-local and link-local", () => {
    expect(isPrivateIPv6("::1")).toBe(true);
    expect(isPrivateIPv6("fc00::1")).toBe(true);
    expect(isPrivateIPv6("fd12:3456::1")).toBe(true);
    expect(isPrivateIPv6("fe80::1")).toBe(true);
  });

  it("unwraps IPv4-mapped IPv6 addresses and checks them as IPv4", () => {
    expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIPv6("::ffff:8.8.8.8")).toBe(false);
  });

  it("does not flag an ordinary public IPv6 address", () => {
    expect(isPrivateIPv6("2606:4700:4700::1111")).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it("dispatches to the right checker based on address format", () => {
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });
});
