export interface TargetElementDef {
  id: string
  name: string
  description: string
  initialSelector: string
  expectedTextSnippet?: string
  expectedTag: string
  expectedAttr?: { name: string; valueSnippet: string }
}

export const TARGET_ELEMENTS: TargetElementDef[] = [
  {
    id: 'what-input',
    name: 'Search Keyword Input ("What")',
    description: 'The primary job title search input with placeholder "Job title, keywords, or company"',
    initialSelector: 'input.css-1rtikjh',
    expectedTag: 'input',
    expectedAttr: { name: 'placeholder', valueSnippet: 'Job title' },
  },
  {
    id: 'where-input',
    name: 'Location Input ("Where")',
    description: 'The location search input with placeholder "City, state, zip code..."',
    initialSelector: 'input.css-1lonhz0',
    expectedTag: 'input',
    expectedAttr: { name: 'placeholder', valueSnippet: 'City' },
  },
  {
    id: 'submit-button',
    name: 'Submit Button ("Find jobs")',
    description: 'The primary search submission button',
    initialSelector: 'button.css-17qy6hn',
    expectedTextSnippet: 'Find jobs',
    expectedTag: 'button',
  },
  {
    id: 'remote-filter',
    name: 'Remote Filter Pill',
    description: 'The filter pill button for Remote jobs',
    initialSelector: 'button.css-1k63ypn.active',
    expectedTextSnippet: 'Remote',
    expectedTag: 'button',
  },
  {
    id: 'job-title-1',
    name: 'Job 1 Title Link',
    description: 'The title link for the first Unity Developer listing',
    initialSelector: 'h2.css-job-title-heading a',
    expectedTextSnippet: 'Unity Developer',
    expectedTag: 'a',
  },
  {
    id: 'job-company-1',
    name: 'Job 1 Company Name',
    description: 'The company name element ("Unity Technologies")',
    initialSelector: 'div.css-company-name',
    expectedTextSnippet: 'Unity Technologies',
    expectedTag: 'div',
  },
  {
    id: 'job-salary-1',
    name: 'Job 1 Salary Badge',
    description: 'The estimated salary badge ("$140,000 - $185,000 a year")',
    initialSelector: 'div.css-salary-badge',
    expectedTextSnippet: '$140,000',
    expectedTag: 'div',
  },
  {
    id: 'apply-button-1',
    name: 'Job 1 Apply Button',
    description: 'The "Easily apply" call-to-action button',
    initialSelector: 'button.css-apply-button',
    expectedTextSnippet: 'Easily apply',
    expectedTag: 'button',
  },
  {
    id: 'pagination-next',
    name: 'Pagination "Next" Button',
    description: 'The Next page navigation button',
    initialSelector: 'button.serp-page-next',
    expectedTextSnippet: 'Next',
    expectedTag: 'button',
  },
]
