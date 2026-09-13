import sharp from "sharp";
import fs from "fs";
import path from "path";

const width = 1080;
const height = 1080;

const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0b0f"/>
      <stop offset="50%" stop-color="#0d0e12"/>
      <stop offset="100%" stop-color="#08090c"/>
    </linearGradient>

    <linearGradient id="goldGradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F3C363"/>
      <stop offset="50%" stop-color="#E5A93C"/>
      <stop offset="100%" stop-color="#B87B1D"/>
    </linearGradient>

    <linearGradient id="cardGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1f2433" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#12151e" stop-opacity="0.95"/>
    </linearGradient>

    <radialGradient id="ambientGold" cx="50%" cy="15%" r="40%">
      <stop offset="0%" stop-color="#E5A93C" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#E5A93C" stop-opacity="0"/>
    </radialGradient>

    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgGradient)"/>
  <rect width="${width}" height="${height}" fill="url(#ambientGold)"/>

  <path d="M0 80 H1080 M0 980 H1080 M100 0 V1080 M980 0 V1080" stroke="#ffffff" stroke-opacity="0.02" stroke-width="1"/>

  <g transform="translate(540, 65)" text-anchor="middle">
    <text font-family="system-ui, -apple-system, sans-serif" font-size="30" font-weight="900" fill="#E5A93C" letter-spacing="6">BAZAREX</text>
    <text y="28" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="#8E97AB" letter-spacing="3">OFFICIAL TRANSACTION VERIFICATION</text>
  </g>

  <!-- Exchange Counter Badge Container: Top ~145px, Left ~440px (200w x 58h) -->
  <g filter="url(#shadow)">
    <rect x="440" y="145" width="200" height="58" rx="29" fill="url(#goldGradient)" stroke="#FFE082" stroke-width="1.5"/>
  </g>

  <!-- Card Labels -->
  <g transform="translate(320, 252)" text-anchor="middle">
    <rect x="-100" y="-22" width="200" height="34" rx="17" fill="#121622" stroke="#2a3348" stroke-width="1"/>
    <circle cx="-64" cy="-5" r="4.5" fill="#10B981"/>
    <text x="6" y="0" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#F3F4F6" letter-spacing="1.5">WE RECEIVED</text>
  </g>

  <g transform="translate(755, 252)" text-anchor="middle">
    <rect x="-100" y="-22" width="200" height="34" rx="17" fill="#121622" stroke="#2a3348" stroke-width="1"/>
    <circle cx="-64" cy="-5" r="4.5" fill="#3B82F6"/>
    <text x="6" y="0" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#F3F4F6" letter-spacing="1.5">WE SENT</text>
  </g>

  <!-- Card borders -->
  <rect x="140" y="280" width="360" height="640" rx="36" fill="url(#cardGlow)" stroke="#2b3447" stroke-width="2" filter="url(#shadow)"/>
  <rect x="575" y="280" width="360" height="640" rx="36" fill="url(#cardGlow)" stroke="#2b3447" stroke-width="2" filter="url(#shadow)"/>

  <!-- Footer Section -->
  <g transform="translate(540, 960)" text-anchor="middle">
    <line x1="-360" y1="-15" x2="360" y2="-15" stroke="#232a3b" stroke-width="1"/>
    <text font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#E5A93C" letter-spacing="2">FAST • SECURE • GUARANTEED</text>
    <text y="24" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" fill="#6B7280" letter-spacing="1">TRUSTED P2P EXCHANGE • DISCORD: .GG/BAZAREX</text>
  </g>
</svg>
`;

async function main() {
  const dir = path.join(process.cwd(), "public", "templates");
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, "base-frame.png");
  await sharp(Buffer.from(svg))
    .png({ quality: 100 })
    .toFile(outPath);
  console.log("Successfully generated base frame at:", outPath);
}

main().catch(console.error);
