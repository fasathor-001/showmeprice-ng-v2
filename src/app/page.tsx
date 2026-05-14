import {
  Hero,
  PopularCategories,
  FeaturedListings,
  HowItWorks,
} from "@/components/home";

export const runtime = "edge";

export default function HomePage() {
  return (
    <>
      <Hero />
      <PopularCategories />
      <FeaturedListings />
      <HowItWorks />
    </>
  );
}
