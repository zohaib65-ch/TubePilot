// Shared between server and client code.

export const PRIVACY_OPTIONS = ["private", "unlisted", "public"] as const;
export type Privacy = (typeof PRIVACY_OPTIONS)[number];

export const PRIVACY_LABELS: Record<Privacy, string> = {
  private: "Private",
  unlisted: "Unlisted",
  public: "Public",
};

export const YOUTUBE_CATEGORIES = [
  { id: "1", label: "Film & Animation" },
  { id: "15", label: "Pets & Animals" },
  { id: "22", label: "People & Blogs" },
  { id: "23", label: "Comedy" },
  { id: "24", label: "Entertainment" },
  { id: "27", label: "Education" },
] as const;

export const PROMPTS_PER_DAY = 3;

// YouTube Data API limits.
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 5000;
export const TAGS_TOTAL_MAX = 500;

export const DEFAULT_CHANNEL_NICHE =
  "Family-friendly short-form entertainment: cute animals, funny animal stories and magical cartoon worlds.";

/** YouTube counts a tag containing spaces as if it were wrapped in quotes. */
export function tagsLength(tags: string[]): number {
  return tags.reduce((sum, t) => sum + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}
