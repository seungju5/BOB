import type {Metadata} from 'next';
import {PowerLab} from '@/components/power/PowerLab';

export const metadata: Metadata = {title:'밥솥 소식 · 밥뭇나', description:'밥솥이 전하는 작은 소식을 편하게 살펴보세요. 예시와 직접 불러온 기록으로 밥솥 사용 패턴을 확인할 수 있어요.'};
export default function Page() { return <PowerLab/>; }
