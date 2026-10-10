import { NextResponse, type NextRequest } from "next/server";
import { getDictionary } from "@/lib/dictionary";
import { isLocale } from "@/lib/i18n";
import { whatsappHref } from "@/lib/links";

const CASE_NUMBER = /^RS-\d{4}-\d{6}$/;

/**
 * The one way into the business WhatsApp number: the prefilled first message in the page's language, with the case
 * number when the page knows it (which lets the coordinator see which case a person is writing about). A case number is
 * a hint for the reader, never proof of who is writing.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = getDictionary(isLocale(locale) ? locale : "en");
  const caseNumber = request.nextUrl.searchParams.get("case");
  const text = caseNumber && CASE_NUMBER.test(caseNumber)
    ? d.form.whatsappCaseMessage.replace("{caseNumber}", caseNumber)
    : d.common.whatsappIntro;
  return NextResponse.redirect(whatsappHref(text), 302);
}
