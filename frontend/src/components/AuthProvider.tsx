"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "oidc-client-ts";
import { authManager } from "@/lib/auth-client";
import { apiFetchAs } from "@/lib/api";
import { reauthenticationAcr, type Me } from "@/lib/access";

/**
 * `user` is the identity session; `me` is what the platform says this person holds (`GET /api/v1/me`), read once per
 * signed-in subject. `roles` is `me.roles` for convenience. `meFailed` means the read failed — never "no access".
 */
type AuthValue={user:User|null;me:Me|null;roles:string[];loading:boolean;meFailed:boolean;refreshMe:()=>void;signIn:(reauthenticate?:boolean,returnTo?:string,requiredAcr?:"2"|"3")=>Promise<void>;signOut:()=>Promise<void>};
const Context=createContext<AuthValue|null>(null);
export function AuthProvider({children}:{children:React.ReactNode}){
  const [user,setUser]=useState<User|null>(null);const[loading,setLoading]=useState(true);
  const[attempt,setAttempt]=useState(0);
  useEffect(()=>{const manager=authManager();manager.getUser().then(value=>setUser(value?.expired?null:value)).finally(()=>setLoading(false));const loaded=(value:User)=>setUser(value);const unloaded=()=>setUser(null);manager.events.addUserLoaded(loaded);manager.events.addUserUnloaded(unloaded);return()=>{manager.events.removeUserLoaded(loaded);manager.events.removeUserUnloaded(unloaded);};},[]);
  const token=user?.access_token;const subject=user?.profile?.sub;
  // One /me read per signed-in subject (or explicit refresh), not per silent token renewal. The answer is kept with the
  // key it was read for, so a stale answer is never shown for another subject and loading is derived, not stored.
  const key=token&&subject?`${subject}#${attempt}`:null;
  const[result,setResult]=useState<{key:string|null;me:Me|null;failed:boolean}>({key:null,me:null,failed:false});
  useEffect(()=>{
    if(!token||!key)return;
    let live=true;
    void apiFetchAs(token,"/me").then(async r=>{if(!r.ok)throw new Error(String(r.status));return (await r.json()) as Me;})
      .then(value=>{if(live)setResult({key,me:value,failed:false});}).catch(()=>{if(live)setResult({key,me:null,failed:true});});
    return()=>{live=false;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  const current=!!key&&result.key===key;
  const me=current?result.me:null;const meFailed=current&&result.failed;const meLoading=!!key&&!current;
  const refreshMe=useCallback(()=>setAttempt(n=>n+1),[]);
  // returnTo defaults to the current page; callers that arrive via a one-shot flag (?signin=1, ?continue=1) strip it first so a cancelled sign-in cannot loop.
  const signIn=useCallback(async(reauthenticate=false,returnTo?:string,requiredAcr?:"2"|"3")=>{const locale=window.location.pathname.split("/")[1]==="ar"?"ar":"en";return authManager().signinRedirect({state:{returnTo:returnTo??`${window.location.pathname}${window.location.search}${window.location.hash}`},extraQueryParams:{ui_locales:locale,...(reauthenticate?{acr_values:requiredAcr??reauthenticationAcr(me)}:{})},...(reauthenticate?{prompt:"login",max_age:0}:{})});},[me]);
  const signOut=useCallback(async()=>{const locale=window.location.pathname.split("/")[1]==="ar"?"ar":"en";await authManager().signoutRedirect({post_logout_redirect_uri:`${window.location.origin}/${locale}/portal`});},[]);
  const value=useMemo(()=>({user,me,roles:me?.roles??[],loading:loading||meLoading,meFailed,refreshMe,signIn,signOut}),[user,me,loading,meLoading,meFailed,refreshMe,signIn,signOut]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth(){const value=useContext(Context);if(!value)throw new Error("useAuth must be used inside AuthProvider");return value;}
