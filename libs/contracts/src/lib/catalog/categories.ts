export interface CategoryDefinition {
  readonly slug: string;
  readonly name: string;
  readonly parentSlug: string | null;
}

const TAXONOMY: Readonly<Record<string, readonly string[]>> = {
  Arts: [
    'Books',
    'Design',
    'Fashion & Beauty',
    'Food',
    'Performing Arts',
    'Visual Arts',
  ],
  Business: [
    'Careers',
    'Entrepreneurship',
    'Investing',
    'Management',
    'Marketing',
    'Non-Profit',
  ],
  Comedy: ['Comedy Interviews', 'Improv', 'Stand-Up'],
  Education: ['Courses', 'How To', 'Language Learning', 'Self-Improvement'],
  Fiction: ['Comedy Fiction', 'Drama', 'Science Fiction'],
  Government: [],
  History: [],
  'Health & Fitness': [
    'Alternative Health',
    'Fitness',
    'Medicine',
    'Mental Health',
    'Nutrition',
    'Sexuality',
  ],
  'Kids & Family': [
    'Education for Kids',
    'Parenting',
    'Pets & Animals',
    'Stories for Kids',
  ],
  Leisure: [
    'Animation & Manga',
    'Automotive',
    'Aviation',
    'Crafts',
    'Games',
    'Hobbies',
    'Home & Garden',
    'Video Games',
  ],
  Music: ['Music Commentary', 'Music History', 'Music Interviews'],
  News: [
    'Business News',
    'Daily News',
    'Entertainment News',
    'News Commentary',
    'Politics',
    'Sports News',
    'Tech News',
  ],
  'Religion & Spirituality': [
    'Buddhism',
    'Christianity',
    'Hinduism',
    'Islam',
    'Judaism',
    'Religion',
    'Spirituality',
  ],
  Science: [
    'Astronomy',
    'Chemistry',
    'Earth Sciences',
    'Life Sciences',
    'Mathematics',
    'Natural Sciences',
    'Nature',
    'Physics',
    'Social Sciences',
  ],
  'Society & Culture': [
    'Documentary',
    'Personal Journals',
    'Philosophy',
    'Places & Travel',
    'Relationships',
  ],
  Sports: [
    'Baseball',
    'Basketball',
    'Cricket',
    'Fantasy Sports',
    'Football',
    'Golf',
    'Hockey',
    'Rugby',
    'Running',
    'Soccer',
    'Swimming',
    'Tennis',
    'Volleyball',
    'Wilderness',
    'Wrestling',
  ],
  Technology: [],
  'True Crime': [],
  'TV & Film': [
    'After Shows',
    'Film History',
    'Film Interviews',
    'Film Reviews',
    'TV Reviews',
  ],
};

export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const CATEGORIES: readonly CategoryDefinition[] = Object.entries(
  TAXONOMY,
).flatMap(([parent, children]) => {
  const parentSlug = categorySlug(parent);
  return [
    { slug: parentSlug, name: parent, parentSlug: null },
    ...children.map((child) => ({
      slug: categorySlug(child),
      name: child,
      parentSlug,
    })),
  ];
});

export const CATEGORY_SLUGS: readonly string[] = CATEGORIES.map((c) => c.slug);
