"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "oidc-client-ts";
import { authManager } from "@/lib/auth-client";
import { apiFetchAs } from "@/lib/api";
import { reauthenticationAcr, type Me } from "@/lib/access";

/**
 * `user` is the identity session; `me` is what the platform says this person holds (`GET /api/v1/me`), read once per
 * signed-in subject. `roles` is `me.roles` for convenience. `meFailed` means the read failed — never "no access".
 * STF-02: when `/me` reports `ACTIVATE_ACCOUNT` (an invited workforce person), the same read asks the platform to activate
 * the account — the backend decides, from the identity provider, whether MFA is enrolled — and re-reads `/me` so the
 * granted roles take effect. A refusal (e.g. `MFA_ENROLMENT_REQUIRED`) is kept as `activationIssue`; `refreshMe` retries.
 */
export type ActivationIssue={code:string;message:string};
type AuthValue={user:User|null;me:Me|null;roles:string[];loading:boolean;meFailed:boolean;activationIssue:ActivationIssue|null;refreshMe:()=>void;signIn:(reauthenticate?:boolean,returnTo?:string)=>Promise<void>;signOut:()=>Promise<void>};
const Context=createContext<AuthValue|null>(null);
export function AuthProvider({children}:{children:React.ReactNode}){
  const [user,setUser]=useState<User|null>(null);const[loading,setLoading]=useState(true);
  const[attempt,setAttempt]=useState(0);
  useEffect(()=>{const manager=authManager();manager.getUser().then(value=>setUser(value?.expired?null:value)).finally(()=>setLoading(false));const loaded=(value:User)=>setUser(value);const unloaded=()=>setUser(null);manager.events.addUserLoaded(loaded);manager.events.addUserUnloaded(unloaded);return()=>{manager.events.removeUserLoaded(loaded);manager.events.removeUserUnloaded(unloaded);};},[]);
  const token=user?.access_token;const subject=user?.profile?.sub;
  // One /me read per signed-in subject (or explicit refresh), not per silent token renewal. The answer is kept with the
  // key it was read for, so a stale answer is never shown for another subject and loading is derived, not stored.
  const key=token&&subject?`${subject}#${attempt}`:null;
  const[result,setResult]=useState<{key:string|null;me:Me|null;failed:boolean;activationIssue:ActivationIssue|null}>({key:null,me:null,failed:false,activationIssue:null});
  useEffect(()=>{
    if(!token||!key)return;
    let live=true;
    const read=async()=>{const r=await apiFetchAs(token,"/me");if(!r.ok)throw new Error(String(r.status));return (await r.json()) as Me;};
    void read().then(async value=>{
      if(!value.pendingActions?.includes("ACTIVATE_ACCOUNT"))return {me:value,activationIssue:null};
      const issue=await activate(token);
      return issue?{me:value,activationIssue:issue}:{me:await read(),activationIssue:null};
    }).then(value=>{if(live)setResult({key,...value,failed:false});}).catch(()=>{if(live)setResult({key,me:null,failed:true,activationIssue:null});});
    return()=>{live=false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  const current=!!key&&result.key===key;
  const me=current?result.me:null;const meFailed=current&&result.failed;const activationIssue=current?result.activationIssue:null;const meLoading=!!key&&!current;
  const refreshMe=useCallback(()=>setAttempt(n=>n+1),[]);
  // signIn reads `me` through a ref so its identity never changes: consumers put it in effect and callback dependencies
  // (the portal's `api`), and a new signIn on every /me reload re-ran those effects — including the patient session
  // registration, which itself refreshes /me — in an endless loop.
  const meRef=useRef(me);
  useEffect(()=>{meRef.current=me;},[me]);
  // returnTo defaults to the current page; callers that arrive via a one-shot flag (?signin=1, ?continue=1) strip it first so a cancelled sign-in cannot loop.
  const signIn=useCallback(async(reauthenticate=false,returnTo?:string)=>{const locale=window.location.pathname.split("/")[1]==="ar"?"ar":"en";return authManager().signinRedirect({state:{returnTo:returnTo??`${window.location.pathname}${window.location.search}${window.location.hash}`},extraQueryParams:{ui_locales:locale,...(reauthenticate?{acr_values:reauthenticationAcr(meRef.current)}:{})},...(reauthenticate?{prompt:"login",max_age:0}:{})});},[]);
  const signOut=useCallback(async()=>{const locale=window.location.pathname.split("/")[1]==="ar"?"ar":"en";await authManager().signoutRedirect({post_logout_redirect_uri:`${window.location.origin}/${locale}/portal`});},[]);
  const value=useMemo(()=>({user,me,roles:me?.roles??[],loading:loading||meLoading,meFailed,activationIssue,refreshMe,signIn,signOut}),[user,me,loading,meLoading,meFailed,activationIssue,refreshMe,signIn,signOut]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** POST /me/activation: null once activated, otherwise the platform's refusal (a network failure is a retryable refusal). */
async function activate(token:string):Promise<ActivationIssue|null>{
  try{const r=await apiFetchAs(token,"/me/activation",{method:"POST"});if(r.ok)return null;const body=await r.json().catch(()=>({}));return {code:body.code??String(r.status),message:body.message??""};}
  catch{return {code:"NETWORK",message:""};}
}
export function useAuth(){const value=useContext(Context);if(!value)throw new Error("useAuth must be used inside AuthProvider");return value;}
