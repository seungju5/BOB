import { connection } from 'next/server';
import { handleNotificationRequest } from '../../../../lib/firebase/team-push-server.mjs';

export async function GET(request: Request) {
  await connection();
  return handleNotificationRequest(request);
}

export const OPTIONS = handleNotificationRequest;
