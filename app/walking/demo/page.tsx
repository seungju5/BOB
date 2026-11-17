import type {Metadata} from 'next';
import {WalkingDemo} from '@/components/walking/WalkingDemo';
export const metadata:Metadata={title:'산책 랭킹 예시 체험 · 밥뭇나',description:'가상의 걸음수로 순위와 공동 순위를 살펴보는 예시 체험이에요.'};
export default function Page(){return <WalkingDemo/>;}
