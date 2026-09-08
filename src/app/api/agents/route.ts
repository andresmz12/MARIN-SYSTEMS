import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function validateBody(body: unknown): { name: string; agentName: string; role: string | null; healthUrl: string; color: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const healthUrl = typeof b.healthUrl === 'string' ? b.healthUrl.trim() : '';
  if (!name || !healthUrl) return null;
  try {
    new URL(healthUrl);
  } catch {
    return null;
  }
  const agentName = typeof b.agentName === 'string' && b.agentName.trim() ? b.agentName.trim() : 'Agente';
  const role = typeof b.role === 'string' && b.role.trim() ? b.role.trim() : null;
  const color = typeof b.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : '#22d3ee';
  return { name, agentName, role, healthUrl, color };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apps = await prisma.monitoredApp.findMany({ orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ apps });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = validateBody(await req.json().catch(() => null));
  if (!body) {
    return NextResponse.json({ error: 'Datos inválidos: se requiere name y healthUrl (URL válida)' }, { status: 400 });
  }

  const app = await prisma.monitoredApp.create({ data: body });
  return NextResponse.json({ app }, { status: 201 });
}
