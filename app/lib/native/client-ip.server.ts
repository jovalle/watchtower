import express, { type Request } from "express";

type ClientIpResolver = (
  socketAddress: string | undefined,
  forwardedFor: string | undefined,
) => string;

function trustProxySetting(value: string): string | number | boolean {
  const normalized = value.trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return normalized;
}

export function createPairingClientIpResolver(
  setting = process.env.TRUST_PROXY,
): ClientIpResolver {
  if (!setting?.trim()) {
    return (socketAddress) => socketAddress || "unknown";
  }

  const proxyApp = express();
  proxyApp.set("trust proxy", trustProxySetting(setting));

  return (socketAddress, forwardedFor) => {
    const proxyRequest = Object.create(express.request) as Request;
    Object.defineProperties(proxyRequest, {
      app: { value: proxyApp },
      headers: {
        value: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
      },
      socket: { value: { remoteAddress: socketAddress } },
    });
    return proxyRequest.ip || socketAddress || "unknown";
  };
}