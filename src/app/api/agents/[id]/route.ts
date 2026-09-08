import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function validatePatch(body: unknown): Partial<{ name: string; agentName: string; role: string | null; healthUrl: string; color: string }> | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || !b.name.trim()) return null;
    out.name = b.name.trim();
  }
  if (b.healthUrl !== undefined) {
    if (typeof b.healthUrl !== 'string') return null;
    try {
      new URL(b.healthUrl);
    } catch {
      return null;
    }
    out.healthUrl = b.healthUrl.trim();
  }
  if (b.agentName !== undefined) {
    out.agentName = typeof b.agentName === 'string' && b.agentName.trim() ? b.agentName.trim() : 'Agente';
  }
  if (b.role !== undefined) {
    out.role = typeof b.role === 'string' && b.role.trim() ? b.role.trim() : null;
  }
  if (b.color !== undefined) {
    if (typeof b.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(b.color)) return null;
    out.color = b.color;
  }
  return out;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const patch = validatePatch(await req.json().catch(() => null));
  if (!patch) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });

  try {
    const app = await prisma.monitoredApp.update({ where: { id: params.id }, data: patch });
    return NextResponse.json({ app });
  } catch {
    return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await prisma.monitoredApp.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });
  }
}
