import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { ThemeModeProvider, themeModeBootstrapScript } from "@/components/providers/theme-mode-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

import "./globals.css";

/**
 * Inter carries the whole UI. It is a variable font, so weights and the optical
 * size axis come out of one file, and `opsz` is what lets a 1.875rem page title
 * and a 0.6875rem table header hold the same stroke weight instead of reading
 * as two different typefaces.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: {
    default: "Inventory",
    template: "%s · Inventory",
  },
  description: "Track hardware, hand it out, and keep the trail.",
  applicationName: "Inventory",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F9FA" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1020" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Root layout: a Server Component that only owns the document shell.
 *
 * The `data-c54-theme` attribute selects a `@c54/tokens` theme and
 * `data-c54-mode` toggles light/dark. Both are written before first paint by an
 * inline script so the server-rendered markup never flashes the wrong palette,
 * hence `suppressHydrationWarning` on the element the script mutates.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-c54-theme="wire-desk"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <head>
        <script
          // Blocking on purpose: it must set `data-c54-mode` before first paint.
          dangerouslySetInnerHTML={{ __html: themeModeBootstrapScript }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeModeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeModeProvider>
      </body>
    </html>
  );
}
