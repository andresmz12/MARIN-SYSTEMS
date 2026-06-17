import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendTaskEmail } from '@/lib/sendgrid-client'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await prisma.corporateTask.findFirst({
    where: { id: params.id, company: { userId: session.user.id } },
  })
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  const emails = task.employeeEmails
  if (emails.length === 0) return NextResponse.json({ error: 'Sin emails de destinatarios' }, { status: 400 })

  const taskData = {
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    priority: task.priority,
  }

  let sentCount = 0
  const failedEmails: string[] = []
  const errors: string[] = []

  for (const email of emails) {
    const result = await sendTaskEmail(email, taskData, task.attachmentUrl ?? undefined)
    if (result.success) {
      sentCount++
    } else {
      failedEmails.push(email)
      errors.push(result.error ?? 'Error desconocido')
    }
  }

  await prisma.corporateTask.update({
    where: { id: params.id },
    data: { status: 'sent', sentAt: new Date() },
  })

  return NextResponse.json({
    sentCount,
    failedEmails: failedEmails.length > 0 ? failedEmails : undefined,
    errors: errors.length > 0 ? errors : undefined,
  })
}
