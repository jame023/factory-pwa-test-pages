# Factory SIP PWA — Test Preview

This public GitHub Pages site is a test preview for Factory SIP. It starts LINE sign-in through the existing Supabase Auth provider `custom:factory-pwa-line`.

- Supabase Auth and its server-side access-token hook verify the LINE identity and issue the Supabase session.
- The browser uses only the Supabase publishable key. Never add a LINE Channel Secret, Service Role Key, database password, or employee data to this repository.
- The app reads only the signed-in employee and active group rows through Supabase RLS.
- Supabase session material is kept in tab-scoped `sessionStorage`; LINE ID tokens are not persisted.
- Registration is not implemented in this pass. The login screen points to the next pass.
- This test preview is not the Production deployment. Google Sheets and Apps Script are not used here.

If LINE authorization fails on this test URL, stop and check the existing Supabase/LINE redirect configuration before changing credentials.
