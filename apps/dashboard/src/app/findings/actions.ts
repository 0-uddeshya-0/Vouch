'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const dismissFindingSchema = z.object({
  findingId: z.string().uuid('Invalid finding ID'),
});

export type DismissFindingResult =
  | { ok: true }
  | { ok: false; error: string };

export async function dismissFinding(findingId: string): Promise<DismissFindingResult> {
  const parsed = dismissFindingSchema.safeParse({ findingId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid finding ID' };
  }

  const existing = await prisma.finding.findUnique({
    where: { id: parsed.data.findingId },
    select: { id: true, status: true },
  });

  if (!existing) {
    return { ok: false, error: 'Finding not found' };
  }

  if (existing.status !== 'dismissed') {
    await prisma.finding.update({
      where: { id: parsed.data.findingId },
      data: {
        status: 'dismissed',
        dismissedBy: 'Admin',
        dismissedAt: new Date(),
      },
    });
  }

  revalidatePath('/findings');
  return { ok: true };
}
