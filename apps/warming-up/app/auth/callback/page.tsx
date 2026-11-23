'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginReturn() {
  const router = useRouter();
  useEffect(() => { router.replace('/login/'); }, [router]);
  return <main className="p-6"><Link href="/login/" className="underline">로그인 계속하기</Link></main>;
}
