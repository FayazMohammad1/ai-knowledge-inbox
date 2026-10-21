import net from 'node:net';

/**
 * Address ranges a server-side fetcher must never contact (SSRF protection):
 * loopback, private networks, link-local (cloud metadata lives at 169.254.169.254),
 * carrier-grade NAT, multicast and reserved space.
 */
const blockedRanges = new net.BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => blockedRanges.addSubnet(address, prefix, 'ipv4'));
[
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) => blockedRanges.addSubnet(address, prefix, 'ipv6'));

export function isPrivateAddress(ip) {
  const family = net.isIP(ip);
  if (family === 0) return false;
  return blockedRanges.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

export class BlockedAddressError extends Error {
  constructor(address) {
    super(`Refusing to connect to non-public address ${address}`);
    this.name = 'BlockedAddressError';
    this.code = 'ERR_BLOCKED_ADDRESS';
  }
}
