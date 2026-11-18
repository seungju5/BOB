import type {Metadata} from 'next';
import {HeartsExperience} from '@/components/walking/HeartsExperience';
export const metadata:Metadata={title:'오늘의 산책 체험 · 밥뭇나',description:'가상 걸음으로 하트·가족 응원·토끼 꾸미기를 체험해요.'};
export default function Page(){return <HeartsExperience mode="demo"/>;}
