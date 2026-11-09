// Central app configuration. Rename the app by changing APP_NAME.
export const APP_NAME = "Feynman";
export const APP_TAGLINE = "Read it. Hear it. Write it yourself.";

export const TIMEZONE = "America/New_York";

export const WRITING_MINUTES = 30;
export const GRACE_SECONDS = 90; // network slack after the deadline
export const MIN_WORDS = 350;
export const MAX_WORDS = 500;

export const DISCUSSION_MIN_QUESTIONS = 4;
export const DISCUSSION_MAX_QUESTIONS = 5;

export const TIERS = ["easy", "medium", "advanced", "extreme"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  easy: "Easy",
  medium: "Medium",
  advanced: "Advanced",
  extreme: "EXTREME",
};

export const TIER_BLURBS: Record<Tier, string> = {
  easy: "Main ideas and why they matter.",
  medium: "Explain and evaluate, using both sources.",
  advanced: "Methods, limits, and implications.",
  extreme: "Connect two things that seem unrelated.",
};

// Default model; override with ANTHROPIC_MODEL.
export const DEFAULT_MODEL = "claude-sonnet-5-5";

export type NewsFeed = { name: string; url: string; paywalled?: boolean };
export type PodcastFeed = { name: string; appleId?: string; url?: string };

// Free-to-read sources first. NYT is included but marked paywalled so the
// picker only uses it when nothing free is as good (UNC students get free NYT).
export const NEWS_FEEDS: NewsFeed[] = [
  { name: "Quanta Magazine", url: "https://www.quantamagazine.org/feed/" },
  { name: "Science News", url: "https://www.sciencenews.org/feed" },
  { name: "Phys.org", url: "https://phys.org/rss-feed/" },
  { name: "ScienceDaily", url: "https://www.sciencedaily.com/rss/all.xml" },
  { name: "NASA", url: "https://www.nasa.gov/news-release/feed/" },
  { name: "Ars Technica Science", url: "https://feeds.arstechnica.com/arstechnica/science" },
  { name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml", paywalled: true },
];

// Feed URLs are resolved through Apple's podcast lookup at run time (so they
// survive hosting moves); the url is a fallback.
export const PODCAST_FEEDS: PodcastFeed[] = [
  { name: "Nature Podcast", appleId: "81934659" },
  { name: "Science Magazine Podcast", appleId: "120329020", url: "https://feeds.megaphone.fm/AAAS8717073854" },
  { name: "Science Quickly (Scientific American)", appleId: "189330872" },
  { name: "Short Wave (NPR)", appleId: "1482575855", url: "https://feeds.npr.org/510351/podcast.xml" },
];

export const PODCAST_LOOKBACK_DAYS = 45;
