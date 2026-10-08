import { lookup as dnsLookup, LookupAddress, LookupOptions } from 'node:dns';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return false;
  }
  const parsed = ipaddr.parse(address);
  const normalized =
    parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()
      ? (parsed as ipaddr.IPv6).toIPv4Address()
      : parsed;
  return normalized.range() === 'unicast';
}

export function hostToAddress(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '');
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

export function publicOnlyLookup(
  hostname: string,
  options: LookupOptions,
  callback: LookupCallback,
): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, []);
      return;
    }
    const blocked = addresses.find((a) => !isPublicAddress(a.address));
    if (blocked || addresses.length === 0) {
      const denied = Object.assign(
        new Error(`Refusing to connect to non-public address for ${hostname}`),
        { code: 'EPRIVATEADDRESS' },
      );
      callback(denied, []);
      return;
    }
    if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
}
