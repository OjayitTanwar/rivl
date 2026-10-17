# Free signup-email pilot

Checked 17 October 2026. Brevo SMTP is now enabled on the dedicated RIVL hosted project following explicit user approval. One approved direct SMTP test was accepted and Brevo reported Delivered. Signup/confirmation/recovery through the installed app still need end-to-end verification. The earlier default Supabase sender restriction no longer describes the active SMTP connection.

A zero-purchase pilot option is Brevo Free, currently 300 email sends/day. Brevo temporarily rewrites free-mail/unauthenticated senders to its compliant transactional domain. This is a stopgap, not permanent sender identity or a deliverability guarantee. Account approval and verification remain provider decisions.

1. Create your own free account at https://onboarding.brevo.com/ and verify your mailbox. Keep the free plan; no domain purchase is needed to investigate the pilot option.
2. Verify a sender address in Brevo and enable transactional SMTP if approved. Obtain the SMTP login and SMTP key; the SMTP key differs from the API key and account password.
3. Configure Supabase Authentication → SMTP for project xsfxptlnmcxtrsudjkdq with Brevo's displayed relay host, port, login, key and verified sender. Enter secrets directly in the provider settings or a secure local prompt; never commit or paste them into chat.
4. Test one real signup, confirmation link, sign-in, resend cooldown, recovery and expired/reused link from ordinary external mailboxes. A UI success response alone does not prove inbox delivery. Keep confirmation enabled.

Do not promise public registration is fully verified until those tests pass. The user created the Brevo account and SMTP key; the approved key was stored only in hosted Supabase email settings. No paid plan was enabled. The repository intentionally does not contain the SMTP password. SMTP settings are managed remotely; CLI config pull can omit SMTP fields, so verify with a credential-masked config diff rather than assuming an omitted section means SMTP is disabled.

Sources: https://supabase.com/docs/guides/auth/auth-smtp ; https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan ; https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders
