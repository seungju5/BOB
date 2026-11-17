import type {Metadata} from 'next';
import {PowerLab} from '@/components/power/PowerLab';

export const metadata: Metadata = {title:'전력 패턴 실험실 · 밥뭇나', description:'합성 예시와 직접 고른 구간 자료로 전력 패턴의 판단 과정을 살펴보세요. 실제 식사나 건강 상태를 판정하지 않습니다.'};
export default function Page() { return <PowerLab/>; }
