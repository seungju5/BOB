import type { Metadata } from "next";
import { HealthConnectionPage } from "@/components/senior/HealthConnectionPage";

export const metadata: Metadata = { title: "걸음수 연결", description: "휴대폰 걸음수 연결 안내와 밥뭇나 산책 체험을 만나보세요." };
export default function HealthPage() { return <HealthConnectionPage />; }
