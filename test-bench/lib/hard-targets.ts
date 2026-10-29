/**
 * Text alternatives that count as the same target after a real-world redesign.
 *
 * The hard pages intentionally change copy (`Find jobs` -> `Search jobs`,
 * `Easily apply` -> `1-click apply`, `$140,000` -> `$140k`) while keeping the
 * element's role in the page. The adaptive locator chooses the element; these
 * alternatives let the tests assert that the chosen element is still the
 * right one rather than a decoy.
 */
export const HARD_TEXT_ALTERNATIVES: Record<string, string[]> = {
  'what-input': ['Job title', 'Job title, keywords, or company'],
  'where-input': ['City', 'City, state', 'remote'],
  'submit-button': ['Find jobs', 'Search jobs', 'Search'],
  'remote-filter': ['Remote'],
  'job-title-1': ['Unity Developer'],
  'job-company-1': ['Unity Technologies'],
  'job-salary-1': ['$140,000', '$140k', '140,000', '185,000', '185k'],
  'apply-button-1': ['Easily apply', '1-click apply', 'Apply now', 'Apply'],
  'pagination-next': ['Next', 'Next page', 'Load more'],
}
