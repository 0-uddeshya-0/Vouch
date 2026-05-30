'use server';

import { revalidatePath } from 'next/cache';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/auth';
import { getPrisma } from '@/lib/prisma';

const dismissFindingSchema = z.object({
  findingId: z.string().uuid('Invalid finding ID'),
});

export type DismissFindingResult =
  | { ok: true }
  | { ok: false; error: string };

function resolveDismissedByUser(session: Session): string {
  const user = session.user;
  return user?.login ?? user?.name ?? user?.email ?? 'unknown';
}

export async function dismissFinding(findingId: string): Promise<DismissFindingResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const parsed = dismissFindingSchema.safeParse({ findingId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid finding ID' };
  }

  const existing = await getPrisma().finding.findUnique({
    where: { id: parsed.data.findingId },
    select: { id: true, status: true },
  });

  if (!existing) {
    return { ok: false, error: 'Finding not found' };
  }

  if (existing.status !== 'dismissed') {
    await getPrisma().finding.update({
      where: { id: parsed.data.findingId },
      data: {
        status: 'dismissed',
        dismissedBy: resolveDismissedByUser(session),
        dismissedAt: new Date(),
      },
    });
  }

  revalidatePath('/findings');
  return { ok: true };
}
