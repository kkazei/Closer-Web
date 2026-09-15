import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Closer — AI Sales Assistant",
  description:
    "AI-powered sales assistant that qualifies leads through intelligent conversation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
