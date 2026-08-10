"use client";

import dynamic from "next/dynamic";

const CanvasList = dynamic(() => import("@/components/CanvasList"), { ssr: false });

export default function Home() {
  return <CanvasList />;
}
