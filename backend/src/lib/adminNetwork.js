import { BlockList, isIP } from 'node:net';

export const ADMIN_NETWORK_ERROR = 'ADMIN_NETWORK_NOT_ALLOWED';

export function normalizeIPv4(value) {
  if (typeof value !== 'string') return null;
  const address = value.trim().replace(/^::ffff:/i, '');
  return isIP(address) === 4 ? address : null;
}

const nonPublic = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) nonPublic.addSubnet(address, prefix, 'ipv4');
const local = new BlockList();
for (const [address, prefix] of [['127.0.0.0', 8], ['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16]]) local.addSubnet(address, prefix, 'ipv4');

export function parseAdminAllowedIps(env = process.env) {
  const production = env.NODE_ENV === 'production' || env.RENDER === 'true';
  const allowLocal = !production && env.ADMIN_ALLOW_LOCAL_IPS === 'true';
  const entries = (env.ADMIN_ALLOWED_IPS || '').split(',').map(value => value.trim()).filter(Boolean);
  const addresses = entries.map(normalizeIPv4);
  const valid = entries.length > 0 && addresses.every(address => address && (
    !nonPublic.check(address, 'ipv4') || (allowLocal && local.check(address, 'ipv4'))
  ));
  return { valid, allowed: new Set(valid ? addresses : []) };
}

export function getTrustedProxies(env = process.env) {
  const entries = (env.TRUSTED_PROXY_IPS || '').split(',').map(value => value.trim()).filter(Boolean);
  for (const entry of entries) {
    const [address, prefix, extra] = entry.split('/');
    const version = isIP(address);
    if (!version || extra !== undefined || (prefix !== undefined && (
      !/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)
    ))) throw new Error('TRUSTED_PROXY_IPS must contain verified proxy IP addresses or CIDRs, not wildcard or hop-count values.');
  }
  return entries.length ? entries : false;
}
