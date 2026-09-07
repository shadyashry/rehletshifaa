import { AlertTriangle, CheckCircle2, Clock3, FolderKanban, Stethoscope, UsersRound } from "lucide-react";

import type { Locale } from "@/lib/i18n";

type SummaryCase = { status: string; coordinatorSubject?: string; assignmentStatus?: string; overdueTaskCount?: number };
type SummaryTask = { overdue: boolean; status: string };

const completed = new Set(["CLOSED", "CANCELLED", "DECLINED", "CLINICALLY_NOT_SUITABLE"]);
const doctorAction = new Set(["CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW", "ARRIVAL_CONFIRMED"]);
const coordinatorAction = new Set(["RECEIVED", "INFORMATION_REQUIRED", "CLINICAL_RECOMMENDATION_READY", "PROPOSAL_PREPARATION", "REVISION_REQUESTED"]);

export function RoleDashboardSummary({ locale, role, cases, tasks }: { locale: Locale; role: string; cases: SummaryCase[]; tasks: SummaryTask[] }) {
  const ar = locale === "ar";
  const active = cases.filter(item => !completed.has(item.status)).length;
  const overdue = Math.max(tasks.filter(task => task.overdue && task.status !== "COMPLETED").length, cases.reduce((sum,item)=>sum+(item.overdueTaskCount??0),0));
  const pendingAssignments = cases.filter(item => item.assignmentStatus === "PENDING").length;
  const needsAction = cases.filter(item => role === "doctor" ? doctorAction.has(item.status) : role === "coordinator" ? coordinatorAction.has(item.status) : item.assignmentStatus === "PENDING").length;
  const unowned = cases.filter(item => !item.coordinatorSubject && item.status === "RECEIVED").length;
  const roleLine = ar
    ? role === "doctor" ? "ابدأ بالحالات التي تنتظر قرارك السريري." : role === "coordinator" ? "ابدأ بالحالات غير المسندة أو التي تنتظر خطوة منك." : "ابدأ بالعمل المعلّق والأقرب لموعده."
    : role === "doctor" ? "Start with cases waiting for your clinical decision." : role === "coordinator" ? "Start with unowned cases and work waiting on you." : "Start with pending and time-sensitive work.";
  const cards = [
    { label: ar ? "حالات نشطة" : "Active cases", value: active, Icon: FolderKanban, tone: "bg-brand-50 text-brand-800" },
    { label: ar ? "تحتاج إجراء" : "Need action", value: needsAction, Icon: role === "doctor" ? Stethoscope : CheckCircle2, tone: "bg-sky-50 text-sky-900" },
    { label: ar ? "تعيينات معلّقة" : "Pending assignments", value: pendingAssignments, Icon: UsersRound, tone: "bg-violet-50 text-violet-900" },
    { label: ar ? "متأخرة" : "Overdue", value: overdue, Icon: overdue ? AlertTriangle : Clock3, tone: overdue ? "bg-alert-50 text-alert-800" : "bg-stone-50 text-ink-700" },
  ];
  if (role === "coordinator") cards[2] = { label: ar ? "بدون منسق" : "Unowned", value: unowned, Icon: UsersRound, tone: "bg-violet-50 text-violet-900" };

  return <section aria-labelledby="dashboard-summary-title" className="mb-7">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="dashboard-summary-title" className="title">{ar ? "نظرة سريعة" : "At a glance"}</h2><p className="mt-1 text-sm text-ink-500">{roleLine}</p></div><p className="text-xs font-semibold text-ink-400">{ar ? "تتحدث الأرقام مع قائمة العمل" : "Counts update with your work queue"}</p></div>
    <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(({label,value,Icon,tone})=><div key={label} className="card flex items-center gap-4 p-4"><span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}><Icon size={20} aria-hidden/></span><div><dt className="text-xs font-semibold text-ink-500">{label}</dt><dd className="mt-0.5 text-2xl font-bold text-ink-900">{value}</dd></div></div>)}</dl>
  </section>;
}
