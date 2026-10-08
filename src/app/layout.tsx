import type { Metadata, Viewport } from "next";
import "@/styles/tokens.css";
import "@/styles/themes.css";
import "@/styles/layout.css";
import "@/styles/components.css";

export const metadata: Metadata = {
  title: "파쇄 시뮬레이터",
  description: "서류를 파쇄해 돈을 벌고 파쇄기를 업그레이드하는 사무실 시뮬레이터",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// 첫 페인트 전에 저장된 테마를 적용해 깜빡임(FOUC)을 막는다 (키는 src/game/settings.ts 의 THEME_KEY)
const themeScript = `(function(){try{var t=localStorage.getItem("shredder.theme");if(t==="green"||t==="navy"||t==="night"||t==="system")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" data-theme="green" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
