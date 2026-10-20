import { Suspense } from "react";
import { TasteForgeApp } from "@/components/TasteForgeApp";

// With Cache Components, reading searchParams is runtime data and must sit inside Suspense.
async function Gate({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  return <TasteForgeApp demo={params.demo === "1"} />;
}

export default function Home(props: PageProps<"/">) {
  return (
    <Suspense fallback={<TasteForgeApp />}>
      <Gate searchParams={props.searchParams} />
    </Suspense>
  );
}
