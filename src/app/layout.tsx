import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const poppins = Poppins({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { template: "%s · OpenAlameda", default: "OpenAlameda" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
