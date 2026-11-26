import type {Metadata} from 'next';
import {HeartsEntry} from '@/components/walking/HeartsEntry';
export const metadata:Metadata={title:'워밍이의 산책 · 밥뭇나',description:'휴대폰으로 내 산책 걸음을 측정하고, 워밍이의 차림과 산책길을 골라요.'};
export default function Page(){return <HeartsEntry/>;}
