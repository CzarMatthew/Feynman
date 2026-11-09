import type { Metadata, Viewport } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import { getUser } from "@/lib/supabase/server";
import Nav from "@/components/Nav";
import "@fontsource/bitter/latin-400.css";
import "@fontsource/bitter/latin-400-italic.css";
import "@fontsource/bitter/latin-600.css";
import "@fontsource/bitter/latin-700.css";
import "@fontsource/shrikhand/latin-400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "A daily science article and podcast, a timed essay, and a red pen.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#c2541c" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <html lang="en">
      <body>
        <div className="stripes" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
        <header className="masthead">
          <div>
            <a className="wordmark" href="/">{APP_NAME}</a>
            <div className="tagline">{APP_TAGLINE}</div>
          </div>
          {user && <Nav />}
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
