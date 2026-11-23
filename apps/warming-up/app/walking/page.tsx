import type {Metadata} from 'next';
import {HeartsEntry} from '@/components/walking/HeartsEntry';
export const metadata:Metadata={title:'오늘의 산책 · 밥뭇나',description:'한 걸음씩 하트를 채우고, 가족의 따뜻한 응원을 만나보세요.'};
export default function Page(){return <HeartsEntry/>;}
