import sharp from "sharp";
import fs from "fs";
import path from "path";

export interface CompositeOptions {
  receivedImageBuffer: Buffer;
  sentImageBuffer: Buffer;
  exchangeNo: number;
  customFramePath?: string;
}

// Pixel-perfect layout coordinates matched to ebg.webp
const CARD_WIDTH = 350;
const CARD_HEIGHT = 598;
const CARD_RADIUS = 36;

const LEFT_CARD_OFFSET = { left: 139, top: 283 };
const RIGHT_CARD_OFFSET = { left: 538, top: 285 };

const COUNTER_OFFSET = { left: 445, top: 138 };
const COUNTER_WIDTH = 182;
const COUNTER_HEIGHT = 74;

function createRoundedMask(width: number, height: number, radius: number): Buffer {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#ffffff" />
    </svg>
  `);
}

function createCounterSvg(exchangeNo: number): Buffer {
  return Buffer.from(`
    <svg width="${COUNTER_WIDTH}" height="${COUNTER_HEIGHT}" viewBox="0 0 ${COUNTER_WIDTH} ${COUNTER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <text x="50%" y="53"
            text-anchor="middle"
            font-family="system-ui, -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
            font-size="46"
            font-weight="900"
            letter-spacing="-1"
            fill="#111111">#${exchangeNo}</text>
    </svg>
  `);
}

export async function compositeExchangeCard(options: CompositeOptions): Promise<Buffer> {
  const { receivedImageBuffer, sentImageBuffer, exchangeNo, customFramePath } = options;

  const defaultTemplate = path.join(process.cwd(), "public", "templates", "ebg.webp");
  const fallbackTemplate = path.join(process.cwd(), "public", "templates", "base-frame.png");

  const framePath =
    customFramePath && fs.existsSync(customFramePath)
      ? customFramePath
      : fs.existsSync(defaultTemplate)
      ? defaultTemplate
      : fallbackTemplate;

  if (!fs.existsSync(framePath)) {
    throw new Error(`Base template frame not found at ${framePath}`);
  }

  const roundedMask = createRoundedMask(CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);

  // Process Left Card ("WE RECEIVED")
  const processedLeft = await sharp(receivedImageBuffer)
    .resize(CARD_WIDTH, CARD_HEIGHT, {
      fit: "cover",
      position: "top",
    })
    .composite([{ input: roundedMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Process Right Card ("WE SENT")
  const processedRight = await sharp(sentImageBuffer)
    .resize(CARD_WIDTH, CARD_HEIGHT, {
      fit: "cover",
      position: "top",
    })
    .composite([{ input: roundedMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // Dynamic counter badge overlay
  const counterOverlay = createCounterSvg(exchangeNo);

  // Composite cards underneath the template frame so bezels cleanly clip screenshots
  const finalized = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 22, g: 22, b: 27, alpha: 1 },
    },
  })
    .composite([
      {
        input: processedLeft,
        left: LEFT_CARD_OFFSET.left,
        top: LEFT_CARD_OFFSET.top,
      },
      {
        input: processedRight,
        left: RIGHT_CARD_OFFSET.left,
        top: RIGHT_CARD_OFFSET.top,
      },
      {
        input: framePath,
        left: 0,
        top: 0,
      },
      {
        input: counterOverlay,
        left: COUNTER_OFFSET.left,
        top: COUNTER_OFFSET.top,
      },
    ])
    .png({ quality: 95, compressionLevel: 8 })
    .toBuffer();

  return finalized;
}
