const ALLOWED_ORIGINS = [
  'https://chg-website.pages.dev',
  'http://localhost:8787',
  'http://localhost:8788',
];

const FROM_ADDRESS = 'onboarding@resend.dev';
const TO_ADDRESS   = 'henrik.strom00@gmail.com';
const RESEND_URL   = 'https://api.resend.com/emails';

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function validate(d) {
  if (!d.firstName?.trim())  return 'First name is required.';
  if (!d.lastName?.trim())   return 'Last name is required.';
  if (!d.email?.trim())      return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return 'Email is invalid.';
  if (!d.message?.trim())    return 'Message is required.';
  if (d.message.length > 5000) return 'Message is too long.';
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405, origin);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400, origin);
    }

    const error = validate(data);
    if (error) return json({ error }, 422, origin);

    const { firstName, lastName, email, company, message } = data;
    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const subject  = company?.trim()
      ? `New inquiry from ${fullName} — ${company.trim()}`
      : `New inquiry from ${fullName}`;

    const text = [
      `Name: ${fullName}`,
      `Email: ${email.trim()}`,
      company?.trim() ? `Company: ${company.trim()}` : null,
      '',
      message.trim(),
    ].filter(line => line !== null).join('\n');

    const resendResp = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:     FROM_ADDRESS,
        to:       TO_ADDRESS,
        reply_to: email.trim(),
        subject,
        text,
      }),
    });

    if (!resendResp.ok) {
      const err = await resendResp.json().catch(() => ({}));
      console.error('Resend error', resendResp.status, err);
      return json({ error: 'Failed to send. Please try again or email us directly.' }, 502, origin);
    }

    return json({ success: true }, 200, origin);
  },
};
