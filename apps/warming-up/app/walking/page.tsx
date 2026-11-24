import type {Metadata} from 'next';
import {HeartsEntry} from '@/components/walking/HeartsEntry';
export const metadata:Metadata={title:'워밍이의 산책 · 밥뭇나',description:'워밍이에게 옷과 소품을 입히고, 좋아하는 산책길을 함께 걸어요.'};
export default function Page(){return <HeartsEntry/>;}
