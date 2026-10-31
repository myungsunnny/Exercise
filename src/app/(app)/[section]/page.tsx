import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/common/empty-state";
import { COMING_SOON } from "@/lib/nav";

export default async function ComingSoonPage({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const info = COMING_SOON[section];
  if (!info) notFound();
  return (
    <>
      <PageHeader title={info.label} />
      <EmptyState icon={Construction} title={`아직 구현되지 않은 기능입니다 (Phase ${info.phase} 예정)`}>
        <p className="max-w-md text-sm text-muted-foreground">{info.summary}</p>
      </EmptyState>
    </>
  );
}
