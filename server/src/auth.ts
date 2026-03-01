import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

export async function verifyToken(token: string): Promise<DecodedIdToken | null> {
  try {
    return await getAuth().verifyIdToken(token);
  } catch {
    return null;
  }
}
