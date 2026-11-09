# Feynman

Each day you get one science article and one related podcast episode. Open both, pick a level, and press **Write response**. That shows the question and starts a 30-minute clock. Write 350–500 words with paste turned off. Then a red-pen grade marks your writing, you go through each mark, and a coach asks you 4–5 follow-up questions about your thinking.

Built with Next.js 15, Supabase (sign-in and database), and the Anthropic API. It's hosted on Vercel, the same way as Fermi.

## How it works

- **Daily pair (same for everyone).** A Vercel cron job runs at 10:15 UTC (5:15 am Eastern). It reads RSS feeds from free science sources:
  - Quanta
  - Science News
  - Phys.org
  - ScienceDaily
  - NASA
  - Ars Technica
  - NYT Science, used only when it's clearly the best story

  It also reads recent episodes from the Nature Podcast, the Science Magazine Podcast, Science Quickly, and Short Wave. Claude then:
  1. Picks a hard-science story from yesterday, or the most recent one if yesterday has nothing.
  2. Picks the most closely related recent podcast episode.
  3. Reads the article text and the episode's show notes or transcript.
  4. Writes one prompt per level.

  If the cron job fails, opening the Today page builds the pair as a backup.
- **Questions stay hidden.** Questions live in a table the browser can't read. A question is copied into your session only when you press Write response.
- **Timer.** The deadline is stored on the server. Your draft autosaves every 10 seconds and whenever the tab is hidden. At 0:00 the response submits itself. If the tab was closed, the last saved draft is submitted the next time you open the session.
- **Integrity.** Paste and drag-and-drop are blocked, and spellcheck, autocorrect, and Grammarly are turned off. The app also logs any text that appears 30 or more characters at a time. Unusual typing patterns show as a short "Typing check" note on the grade.
- **Grade.** You get six category scores out of 10:
  - Answers the prompt
  - Use of both sources
  - Reasoning & insight
  - Organization
  - Grammar & mechanics
  - Style & clarity

  They're weighted into a score out of 100 and a letter grade. Responses outside 350–500 words lose points. Each red-pen mark is anchored to the exact words it refers to. You click **Got it** on every mark to open the discussion.
- **History and Progress.** History lists every response. Progress shows your overall score over time (marker shape shows the level), your trend in each category, red-pen marks per 100 words, your streak, and a table view.

## Setup (about 20 minutes)

### 1. Supabase
1. Create a **new project**. A new project is the cleanest option. If you reuse Fermi's project instead, first check that it has no tables named `sessions`, `daily_sets`, or `daily_private`.
2. Open **SQL Editor**, paste in all of `supabase/schema.sql`, and run it.
3. Go to **Authentication → URL Configuration**:
   - Set **Site URL** to your Vercel URL (for example, `https://feynman-xyz.vercel.app`).
   - Add `https://feynman-xyz.vercel.app/auth/callback` under **Redirect URLs**.
4. Go to **Authentication → Email Templates → Magic Link** and add the line `Your code: {{ .Token }}` to the template. Now every email has both a link and a 6-digit code. The code is easier on a phone, where the link might open in a different browser.
5. From **Project Settings → API**, copy the Project URL, the anon (publishable) key, and the service_role (secret) key.

### 2. GitHub and Vercel
1. Create an empty repo (for example, `CzarMatthew/feynman`), then push this folder:
   ```bash
   git init && git add -A && git commit -m "Feynman v1"
   git branch -M main
   git remote add origin https://github.com/CzarMatthew/feynman.git
   git push -u origin main
   ```
2. In Vercel, choose **Add New → Project** and import the repo.
3. Add the environment variables from `.env.example`:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
   | `ANTHROPIC_API_KEY` | your Anthropic key |
   | `ALLOWED_EMAILS` | `matthew@czar-nc.com` (comma-separate to add friends) |
   | `CRON_SECRET` | any long random string |
   | `ANTHROPIC_MODEL` | optional, defaults to `claude-sonnet-5-5` |

4. Deploy. The cron job in `vercel.json` registers itself automatically.

### 3. First run
Sign in, and the Today page builds today's pair, which takes about a minute. To rebuild a day by hand:
```
curl -H "Authorization: Bearer $CRON_SECRET" "https://YOUR-URL/api/cron/daily?force=1"
```

## Changing things
- **Name, timer, word limits, discussion length:** `src/lib/config.ts`
- **News and podcast sources:** `NEWS_FEEDS` and `PODCAST_FEEDS` in the same file
- **Colors and type:** `src/app/globals.css`. Brown is the ink, creme is the paper, dark orange is the red pen, and teal means "go" or "done". Type is Shrikhand for the display face and Bitter for everything else, both self-hosted.
- **Prompts for picking, questions, grading, and coaching:** `src/lib/daily.ts` and `src/lib/coach.ts`

## Development
```bash
npm install
cp .env.example .env.local   # fill in
npm run dev
npm test        # parser, scoring, annotation, integrity tests
npm run build
```

## Cost
Each day uses about 2 Claude calls to build the pair and questions, shared by everyone. Each response uses 1 grading call plus about 6 short coaching calls. For one or two people writing daily, expect a few dollars a month on Sonnet.
