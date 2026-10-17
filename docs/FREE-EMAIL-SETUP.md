# Free signup-email pilot

Checked 17 October 2026. Hosted configuration has email confirmations enabled and no custom SMTP sender in the pulled configuration. Supabase's default mailer is restricted to team addresses and currently two messages per hour; ordinary public signup delivery is not ready.

A zero-purchase pilot option is Brevo Free, currently 300 email sends/day. Brevo temporarily rewrites free-mail/unauthenticated senders to its compliant transactional domain. This is a stopgap, not permanent sender identity or a deliverability guarantee. Account approval and verification remain provider decisions.

1. Create your own free account at https://onboarding.brevo.com/ and verify your mailbox. Keep the free plan; no domain purchase is needed to investigate the pilot option.
2. Verify a sender address in Brevo and enable transactional SMTP if approved. Obtain the SMTP login and SMTP key; the SMTP key differs from the API key and account password.
3. Configure Supabase Authentication → SMTP for project xsfxptlnmcxtrsudjkdq with Brevo's displayed relay host, port, login, key and verified sender. Enter secrets directly in the provider settings or a secure local prompt; never commit or paste them into chat.
4. Test one real signup, confirmation link, sign-in, resend cooldown, recovery and expired/reused link from ordinary external mailboxes. A UI success response alone does not prove inbox delivery. Keep confirmation enabled.

Do not promise public registration works until those tests pass. No Brevo account, SMTP secret, paid plan or live sender was created by this source change.

Sources: https://supabase.com/docs/guides/auth/auth-smtp ; https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan ; https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders
