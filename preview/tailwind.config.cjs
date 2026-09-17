/**
 * Reuse the extension's real Tailwind theme (spacing scale, font sizes, and
 * the full `r-*` / `rabby-*` color token set) so the previewed screen looks
 * exactly like it does inside Rabby. We only override `content` so Tailwind
 * scans the preview harness plus the SmartAutomations source it renders.
 */
const rootConfig = require('../tailwind.config.js');

module.exports = {
  ...rootConfig,
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../src/ui/views/SmartAutomations/**/*.{ts,tsx}',
  ],
};
