# BazarEx AutoPost 💸

Autonomous payment proof sanitization, branding composition, and direct Facebook Page publishing automation tool for P2P currency exchange operations.

## Features

- **Zero-Input Dual Classification**: Drop two payment screenshots in any order. The backend autonomously determines which is **WE RECEIVED** and which is **WE SENT**.
- **Dynamic Currency Extraction**: Detects currency pairs (`INR 🇮🇳`, `PKR 🇵🇰`, `BDT 🇧🇩`, `USD 🇺🇸`) directly from receipt text.
- **Privacy Guard OCR & Targeted Blur**: Scans and applies Gaussian blur redaction over phone numbers, UPI handles, transaction/reference IDs, and bank details.
- **Interactive Manual Redaction**: Drag to draw custom blur rectangles over receipts in the dashboard.
- **1080x1080 Branding Compositor**: Single-pass Sharp pipeline placing masked screenshots onto the master frame with dynamic SVG counter overlay.
- **Atomic Counter**: Thread-safe persistence (`data/counter.json`), auto-incrementing only after successful Meta Graph API publish confirmation.
- **Meta Graph API**: Direct photo publishing with dynamic formatted captions and dry-run simulation mode.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript & Tailwind CSS
- Sharp
- Tesseract.js
- Meta Graph API v19.0

## Getting Started

1. Clone repo:
   ```bash
   git clone https://github.com/SiYamVibe/BazarEx-AutoPost.git
   cd BazarEx-AutoPost
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env.local
   ```
   Add your Facebook Page credentials:
   ```env
   FB_PAGE_ID=your_page_id
   FB_PAGE_ACCESS_TOKEN=your_page_token
   ```

4. Run development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000)
