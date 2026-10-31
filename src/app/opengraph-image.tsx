import { PAGES } from "@/lib/metadata";
import { CARD_SIZE, defaultCard, withFallback } from "@/og/card";

const { title } = PAGES.home;

export const size = CARD_SIZE;
export const contentType = "image/png";
// The home title is the site name, so it is not suffixed with it again.
export const alt = title;

export default function Image() {
  return withFallback(() => defaultCard(title), title);
}
