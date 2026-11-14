'use client';
import FirebaseLogin from '@/components/auth/FirebaseLogin';
import SupabaseLogin from '@/components/auth/SupabaseLogin';
import { usesImpactFirebase } from '@/lib/firebase/bridge';
export default function LoginPage(){ return usesImpactFirebase ? <FirebaseLogin /> : <SupabaseLogin />; }
