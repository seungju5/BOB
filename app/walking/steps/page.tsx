import type { Metadata } from 'next';
import { MotionWalkPage } from '@/components/walking/MotionWalkPage';

export const metadata: Metadata = {
  title: '내 걸음 측정 · 밥뭇나',
  description: '휴대폰을 들고 걸으면 내 산책 걸음이 이 기기에 저장돼요.',
};

export default function Page() { return <MotionWalkPage/>; }
