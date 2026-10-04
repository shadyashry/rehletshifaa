/** The original three care areas, in home-page dictionary order (`home.areas`); the rest live in additional-care-areas. */
export const CARE_AREA_SLUGS = ["cardiology", "rheumatology-rehabilitation", "orthopedics"] as const;

export type CareAreaSlug = (typeof CARE_AREA_SLUGS)[number];

