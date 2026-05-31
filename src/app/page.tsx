import {
  Hero,
  PopularCategories,
  FeaturedListings,
  HowItWorks,
  BuyerTrust,
} from "@/components/home";

export const runtime = "edge";

export default function HomePage() {
  return (
    <>
      <Hero />
      <PopularCategories />
      <FeaturedListings />
      <HowItWorks />
      <BuyerTrust />
    </>
  );
}
