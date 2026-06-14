import type { NextConfig } from "next";

const defaultAllowedDevOrigins = [
  "localhost",
  "127.0.0.1",
  "10.88.38.93",
  "chip-chaplain-tapeless.ngrok-free.dev",
];

const extraAllowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    ...new Set([...defaultAllowedDevOrigins, ...extraAllowedDevOrigins]),
  ],
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
    ];
  },
};

export default nextConfig;
