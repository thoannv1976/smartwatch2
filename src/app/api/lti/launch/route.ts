import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LtiError } from '@/server/lti/service';
import { getLtiService, isLtiEnabled, verifyTicket } from '@/server/lti/runtime';

/**
 * Launch from the LMS. The browser posts the Hub ticket; the answer is a
 * Firebase custom token (the page signs in with it and then calls the normal
 * session route) and the path to open next.
 */

const bodySchema = z.object({ ticket: z.string().min(20).max(8000) });

export async function POST(request: Request) {
  if (!isLtiEnabled()) return NextResponse.json({ error: 'notConfigured' }, { status: 404 });

  let ticket: string;
  try {
    ticket = bodySchema.parse(await request.json()).ticket;
  } catch {
    return NextResponse.json({ error: 'ticketInvalid' }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await verifyTicket(ticket);
  } catch (error) {
    console.warn(JSON.stringify({ severity: 'WARNING', message: 'lti ticket rejected', error: String(error) }));
    return NextResponse.json({ error: 'ticketInvalid' }, { status: 401 });
  }

  try {
    const { customToken, next } = await getLtiService().launch(ctx);
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'lti launch',
        tenant: ctx.tenantId,
        role: ctx.role,
        hubUserId: ctx.hubUserId,
        next,
      }),
    );
    return NextResponse.json({ customToken, next });
  } catch (error) {
    if (error instanceof LtiError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error(JSON.stringify({ severity: 'ERROR', message: 'lti launch failed', error: String(error) }));
    return NextResponse.json({ error: 'generic' }, { status: 500 });
  }
}
