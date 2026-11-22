import '@/components/studio/studio.css';
import type { Metadata } from 'next';
import { OperatorConsole } from '@/components/studio/OperatorConsole';
export const metadata: Metadata = { title: '팀 운영 스튜디오', robots: { index: false, follow: false } };
export default function StudioPage() {
  return <OperatorConsole />;
}
