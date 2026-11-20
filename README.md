# EcoSphere

EcoSphere is a static environmental-information website with an Express API for
accounts, news, and the contact form.

## Run locally

1. Install Node.js 22 and run `npm install` from the repository root.
2. Copy `BackEnd/.env.example` to `BackEnd/.env` and set the environment values
   you need.
3. Run `npm start` and open <http://localhost:3000>.

The site pages and assets are served from the repository root by the local
Express server. Account routes require `DATABASE_URL`; the users table and
account columns are created or migrated on the first database-backed request.

## Deploy to Vercel

1. Create a Neon project and copy its pooled PostgreSQL connection string.
2. Import `youssefbkaram/EcoSphere-v0.4` into Vercel. Keep the project root at
   the repository root; the Vercel configuration serves `/` from
   `HTML/index.html` and routes `/api/*` to the Express API function.
3. Add the environment variables below in Vercel **Project Settings → Environment
   Variables**, for Production and Preview as appropriate, then redeploy:

   | Variable | Required for | Value |
   | --- | --- | --- |
   | `DATABASE_URL` | Sign up, login, account, health check | Neon connection string |
   | `GUARDIAN_API_KEY` | Live news page | Guardian Open Platform API key |
   | `RESEND_API_KEY` | Contact form | Resend API key |
   | `CONTACT_FROM_EMAIL` | Contact form | Sender address verified with Resend |
   | `CONTACT_TO_EMAIL` | Contact form | Inbox that receives messages |

   `PORT` is only used for local development; Vercel supplies its own runtime.
   Never commit `.env` files or put server keys in browser JavaScript.
4. Visit `/api/health` on the deployment to confirm Neon connectivity. It
   initializes the account table and profile columns if needed.

The static site can be viewed without credentials, but account features, live
news, and contact email delivery need their corresponding environment variables.
