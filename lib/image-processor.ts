import sharp from "sharp";
import fs from "fs";
import path from "path";

export interface CompositeOptions {
  receivedImageBuffer: Buffer;
  sentImageBuffer: Buffer;
  exchangeNo: number;
  customFramePath?: string;
}

const CARD_WIDTH = 360;
const CARD_HEIGHT = 640;
const CARD_RADIUS = 36;

const LEFT_CARD_OFFSET = { left: 140, top: 280 };
const RIGHT_CARD_OFFSET = { left: 575, top: 280 };

function createRoundedMask(width: number, height: number, radius: number): Buffer {
  return Buffer.from(`
    <svg width="${width}" height="${height}">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff" />
    </svg>
  `);
}

function createCounterSvg(exchangeNo: number): Buffer {
  // Container: 200w x 58h, centered around (540, 174)
  return Buffer.from(`
    <svg width="200" height="58" viewBox="0 0 200 58" xmlns="http://www.w3.org/2000/svg">
      <text x="100" y="42"
            text-anchor="middle"
            font-family="system-ui, -apple-system, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
            font-size="44"
            font-weight="900"
            letter-spacing="-0.5"
            fill="#111111">#${exchangeNo}</text>
    </svg>
  `);
}

export async function compositeExchangeCard(options: CompositeOptions): Promise<Buffer> {
  const { receivedImageBuffer, sentImageBuffer, exchangeNo, customFramePath } = options;

  const framePath =
    customFramePath && fs.existsSync(customFramePath)
      ? customFramePath
      : path.join(process.cwd(), "public", "templates", "base-frame.png");

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

  // Composite everything in a single pass onto 1080x1080 base frame
  const finalized = await sharp(framePath)
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
        input: counterOverlay,
        left: 440,
        top: 145,
      },
    ])
    .png({ quality: 95, compressionLevel: 8 })
    .toBuffer();

  return finalized;
}
