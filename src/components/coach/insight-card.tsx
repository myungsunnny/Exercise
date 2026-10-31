import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Insight } from "@/lib/ai/coach";
import { cn } from "@/lib/utils";

export function InsightCard({ title, insight, period }: { title: string; insight: Insight; period?: string }) {
  const section = (name: string, list: string[], cls?: string) =>
    list.length > 0 && (
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">{name}</p>
        <ul className={cn("list-disc space-y-0.5 pl-5 text-sm", cls)}>{list.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </div>
    );
  return (
    <Card>
      <CardHeader><CardTitle>{title}{period && <span className="ml-2 text-xs font-normal text-muted-foreground">{period}</span>}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="font-semibold">{insight.headline}</p>
        <p className="text-sm leading-relaxed">{insight.summary}</p>
        {section("잘한 점", insight.highlights)}
        {section("주의할 점", insight.concerns)}
        {section("제안", insight.suggestions)}
        {section("데이터 부족", insight.data_gaps, "text-muted-foreground")}
      </CardContent>
    </Card>
  );
}
