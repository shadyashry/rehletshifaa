"use client";

import { useEffect, useState } from "react";
import { authManager } from "@/lib/auth-client";

export default function AuthCallbackPage(){const[error,setError]=useState("");const[locale,setLocale]=useState<"en"|"ar">("en");useEffect(()=>{authManager().signinRedirectCallback().then(user=>{const state=user.state as {returnTo?:string}|undefined;const destination=state?.returnTo??"/en/portal";setLocale(destination.startsWith("/ar/")?"ar":"en");window.location.replace(destination);}).catch(()=>{const arabic=navigator.language.toLowerCase().startsWith("ar");setLocale(arabic?"ar":"en");setError(arabic?"تعذر إكمال تسجيل الدخول. يرجى العودة إلى البوابة والمحاولة مرة أخرى.":"Sign-in could not be completed. Please return to the portal and try again.");});},[]);return <html lang={locale} dir={locale==="ar"?"rtl":"ltr"}><body><main className="container-site section"><h1 className="headline">{locale==="ar"?"جارٍ إكمال تسجيل الدخول الآمن":"Completing secure sign-in"}</h1><p>{error||(locale==="ar"?"يرجى الانتظار…":"Please wait…")}</p></main></body></html>;}
