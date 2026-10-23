import type { NextRequest } from 'next/server';
import type { UserProfile } from '../contracts';

export type RequestContext = {
  req: NextRequest;
  p: string[];
  method: string;
  url: NextRequest['nextUrl'];
  background?: (task: () => Promise<void>) => void;
};

export type AuthenticatedContext = RequestContext & { u: UserProfile };
