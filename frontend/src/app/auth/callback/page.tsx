"use client";

import { useEffect, useState } from "react";
import { authManager } from "@/lib/auth-client";

export default function AuthCallbackPage(){const[error,setError]=useState("");useEffect(()=>{authManager().signinRedirectCallback().then(user=>{const state=user.state as {returnTo?:string}|undefined;window.location.replace(state?.returnTo??"/en/portal");}).catch(()=>setError("Sign-in could not be completed. Please return to the portal and try again."));},[]);return <html lang="en"><body><main className="container-site section"><h1 className="headline">Completing secure sign-in</h1><p>{error||"Please wait…"}</p></main></body></html>;}
