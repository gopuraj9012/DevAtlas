import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Boxes, FileText, Network } from "lucide-react";
import { api, type ArticleSummary, type Overview } from "@/lib/api";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorBanner, FrameworkBadge, ListSkeleton, MicroLabel, PageHeader, SystemDot, SystemTag } from "@/components/kb/Bits";
import { SplitCompare } from "@/components/kb/SplitCompare";

export default function Architecture() {
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/overview") });
  const docs = useQuery({ queryKey: ["articles", "architecture"], queryFn: () => api<ArticleSummary[]>("/articles?section=architecture") });
  const integration = useQuery({ queryKey: ["articles", "integration"], queryFn: () => api<ArticleSummary[]>("/articles?section=integration") });

  return (
    <AppShell>
      <PageHeader eyebrow="Architecture" title="System architecture" description="Two generations of .NET running side by side, sharing one order database. Start with the seam: that is where most changes go wrong."
        actions={<><Link to="/service-map"><Button variant="secondary"><Network /> Service map</Button></Link><Link to="/contracts?view=graph"><Button variant="secondary"><Boxes /> Impact graph</Button></Link></>} />
      {overview.isError && <ErrorBanner error={overview.error} onRetry={() => overview.refetch()} />}
      <div className="grid gap-4 md:grid-cols-2">
        {overview.data?.systems.map((s) => (
          <Card key={s.key} className="p-6">
            <div className="flex items-center justify-between"><SystemDot system={s.key} className="font-semibold" /><FrameworkBadge framework={s.framework} system={s.key} /></div>
            <p className="mt-3 text-sm text-muted-foreground">{s.summary}</p>
          </Card>
        ))}
      </div>
      <SplitCompare className="mt-6" title="The same read on each side of the seam" note="Legacy code returns untyped DataTables from stored procedures; modern code returns typed DTOs from MediatR handlers."
        legacy={{ filename: "OrderService.cs", lang: "csharp", code: "public static DataTable GetOrder(int id)\n{\n    return SqlHelper.ExecuteDataTable(\"usp_GetOrder\",\n        new SqlParameter(\"@OrderId\", id));\n}" }}
        modern={{ filename: "GetOrderHandler.cs", lang: "csharp", code: "public async Task<OrderDto?> Handle(GetOrder q, CancellationToken ct) =>\n    await _db.Orders.AsNoTracking()\n        .Where(o => o.Id == q.Id)\n        .Select(o => new OrderDto(o.Id, o.Number, o.Total))\n        .FirstOrDefaultAsync(ct);" }} />
      {[{ label: "Architecture docs", q: docs }, { label: "Integration docs", q: integration }].map(({ label, q }) => (
        <section key={label} className="mt-10">
          <MicroLabel className="mb-3">{label}</MicroLabel>
          {q.isLoading && <ListSkeleton rows={3} />}
          <div className="grid gap-3 md:grid-cols-2">
            {q.data?.map((d) => (
              <Link key={d.slug} to={`/article/${d.slug}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-lift">
                  <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" aria-hidden /><span className="flex-1 font-semibold">{d.title}</span><SystemTag system={d.system} /></div>
                  <p className="mt-1.5 flex-1 text-[13px] text-muted-foreground">{d.summary}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-primary">Read <ArrowRight className="h-3 w-3" /></span>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </AppShell>
  );
}
