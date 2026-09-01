"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "oidc-client-ts";
import { authManager, userRoles } from "@/lib/auth-client";

type AuthValue={user:User|null;roles:string[];loading:boolean;signIn:()=>Promise<void>;signOut:()=>Promise<void>};
const Context=createContext<AuthValue|null>(null);
export function AuthProvider({children}:{children:React.ReactNode}){
  const [user,setUser]=useState<User|null>(null);const[loading,setLoading]=useState(true);
  useEffect(()=>{const manager=authManager();manager.getUser().then(value=>setUser(value?.expired?null:value)).finally(()=>setLoading(false));const loaded=(value:User)=>setUser(value);const unloaded=()=>setUser(null);manager.events.addUserLoaded(loaded);manager.events.addUserUnloaded(unloaded);return()=>{manager.events.removeUserLoaded(loaded);manager.events.removeUserUnloaded(unloaded);};},[]);
  const signIn=useCallback(async()=>authManager().signinRedirect({state:{returnTo:window.location.pathname}}),[]);
  const signOut=useCallback(async()=>authManager().signoutRedirect(),[]);
  const value=useMemo(()=>({user,roles:userRoles(user),loading,signIn,signOut}),[user,loading,signIn,signOut]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth(){const value=useContext(Context);if(!value)throw new Error("useAuth must be used inside AuthProvider");return value;}
