import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    name, description, longDesc, website, industry, status,
    foundedAt, tools, privateNotes, teamMembers, links,
  } = body

  const company = await prisma.company.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: params.id },
      data: {
        name: name ?? company.name,
        description: description !== undefined ? description : company.description,
        longDesc: longDesc !== undefined ? longDesc : company.longDesc,
        website: website !== undefined ? website : company.website,
        industry: industry !== undefined ? industry : company.industry,
        status: status ?? company.status,
        foundedAt: foundedAt ? new Date(foundedAt) : company.foundedAt,
        tools: tools ?? company.tools,
        privateNotes: privateNotes !== undefined ? privateNotes : company.privateNotes,
      },
    })

    if (teamMembers !== undefined) {
      await tx.companyTeamMember.deleteMany({ where: { companyId: params.id } })
      if (teamMembers.length > 0) {
        await tx.companyTeamMember.createMany({
          data: teamMembers.map((m: { name: string; role: string; email?: string }) => ({
            companyId: params.id,
            name: m.name,
            role: m.role,
            email: m.email || null,
          })),
        })
      }
    }

    if (links !== undefined) {
      await tx.companyLink.deleteMany({ where: { companyId: params.id } })
      if (links.length > 0) {
        await tx.companyLink.createMany({
          data: links.map((l: { name: string; url: string; type: string; description?: string }) => ({
            companyId: params.id,
            name: l.name,
            url: l.url,
            type: l.type || 'Web',
            description: l.description || null,
          })),
        })
      }
    }
  })

  const updated = await prisma.company.findFirst({
    where: { id: params.id },
    include: { teamMembers: true, links: true },
  })

  return NextResponse.json(updated)
}
