import { AlertCircle } from "lucide-react";
export function EmergencyNotice({ text }: { text: string }) { return <aside className="border-b border-[#ead8da] bg-[#fff8f8]" aria-label="Emergency medical notice"><div className="container-site flex gap-3 py-3 text-xs leading-5 text-[#71353b]"><AlertCircle className="mt-0.5 shrink-0" size={16} aria-hidden="true" /><p>{text}</p></div></aside>; }

