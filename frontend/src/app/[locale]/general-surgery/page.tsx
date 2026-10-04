import AdditionalCareArea, { generateMetadata as areaMetadata } from "@/components/AdditionalCareAreaPage";
type Props = { params: Promise<{ locale: string }> };
const areaParams = (params: Props["params"]) => params.then(p => ({ ...p, careArea: "general-surgery" }));
export function generateMetadata({ params }: Props) { return areaMetadata({ params: areaParams(params) }); }
export default function CareAreaPage({ params }: Props) { return <AdditionalCareArea params={areaParams(params)} />; }
