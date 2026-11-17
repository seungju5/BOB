import type {Metadata} from 'next';
import {WalkingPage} from '@/components/walking/WalkingPage';
export const metadata:Metadata={title:'산책·걸음수 랭킹 · 밥뭇나',description:'내 속도로 걷고, 동의한 참여자들과 오늘의 발걸음을 나눠요.'};
export default function Page(){return <WalkingPage/>;}
