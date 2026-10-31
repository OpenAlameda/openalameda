import { PAGES } from "@/lib/metadata";
import { CARD_SIZE, defaultCard, withFallback } from "@/og/card";

const { title } = PAGES.elections;

export const size = CARD_SIZE;
export const contentType = "image/png";
export const alt = `${title} · OpenAlameda`;

export default function Image() {
  return withFallback(() => defaultCard(title), title);
}
