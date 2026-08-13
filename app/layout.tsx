import type { Metadata } from "next";
import "./globals.css";
import { Navigation } from "@/components/shell/Navigation";

export const metadata: Metadata = {
  title: "工具集",
  description: "常用开发工具集合",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="shell">
          <Navigation />
          <main className="shell-content">{children}</main>
        </div>

        <style>{`
          .shell {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
          }
          .shell-content {
            flex: 1;
            display: flex;
            flex-direction: column;
          }
        `}</style>
      </body>
    </html>
  );
}
