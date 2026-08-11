import { SKILL_KEYWORD_MAP, SKILL_KEYWORDS } from './skills-map';
import type { ExtractedJobKeywords, JobCategory } from './types';

/**
 * Dictionary-based job keyword extraction (mock AI).
 * Scans post caption for known Thai skill phrases.
 */
export function extractJobKeywords(content: string): ExtractedJobKeywords {
  const text = content ?? '';
  const skills: string[] = [];
  const categorySet = new Set<JobCategory>();

  for (const keyword of SKILL_KEYWORDS) {
    const found =
      keyword === 'EV'
        ? /\bEV\b/i.test(text) || text.includes('EV')
        : text.includes(keyword);
    if (!found) continue;
    if (!skills.includes(keyword)) skills.push(keyword);
    categorySet.add(SKILL_KEYWORD_MAP[keyword]);
  }

  return {
    skills,
    categories: [...categorySet],
  };
}
