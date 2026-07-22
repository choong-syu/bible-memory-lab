import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "말씀기억 연구소",
  description: "성경 명사를 선택해 빈칸문제를 만들고 오답을 복습하는 학습 도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
