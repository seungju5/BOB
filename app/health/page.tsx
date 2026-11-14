import type { Metadata } from "next";
import { HealthConnectionPage } from "@/components/senior/HealthConnectionPage";

export const metadata: Metadata = { title: "걸음수 연결 · 밥뭇나", description: "Apple 건강과 삼성 헬스의 오늘 걸음을 내 휴대폰에서 확인해요." };
export default function HealthPage() { return <HealthConnectionPage />; }
