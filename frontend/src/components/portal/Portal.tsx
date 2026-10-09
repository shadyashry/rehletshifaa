"use client";

import { NoPortalWorkspace } from "./NoPortalWorkspace";
import { useVirtualClinics, virtualClinicHref } from "@/components/virtual-clinic/virtual-clinic-model";
import { ReauthenticationReturnNotice } from "@/components/ReauthenticationNotices";
import { REAUTHENTICATION_REQUIRED, reauthenticationCopy, requestReauthentication } from "@/lib/reauthentication";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from "react";
import type { CaseViewProps } from "@/components/portal/StaffCaseView";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/AuthProvider";
import type { ProposalCopy } from "@/components/portal/PatientProposal";
import { PortalAccount, type Preferences } from "@/components/portal/PortalAccount";
import { matchesKpi } from "@/components/portal/RoleDashboardSummary";
import { initialQueue, ownershipTab, type QueueState } from "@/components/portal/CaseQueue";
import { StaffNav, isStaffViewId, type StaffViewId, type StaffViewItem } from "@/components/portal/StaffNav";
import { LeaveCaseDialog, useDraftWatch } from "@/components/portal/LeaveCaseGuard";
import type { CareView } from "@/components/portal/MyCare";
import { PatientNav } from "@/components/portal/PatientNav";
import { WorkCopyProvider, useWorkCopy } from "@/components/portal/portal-copy";
import type { WorkCopy } from "@/lib/portal-labels";
import type { AssignmentHistoryEntry } from "@/components/portal/AssignmentHistory";
import { NotificationBell } from "@/components/portal/NotificationBell";
import { ccHref } from "@/components/platform-control-center/control-center-nav";
import { useControlCenterEntry } from "@/components/platform-control-center/ControlCenterNavigation";
import type { Locale } from "@/lib/i18n";
import { holds, leadsTeam, opensControlCenter, portalViews, type PortalView as RoleKey } from "@/lib/access";
import { useRouter } from "next/navigation";
import { apiFetchAs } from "@/lib/api";
import { type CaseView, type StaffCaseResponse, type CatalogService, type FxRate, type CaseDocument, type VerifiedDoctor, type DoctorProfile, type StaffProfile, type CareCategory, type StaffMember, type Task, type Workspace, type MutationResult, refreshAfterRejectedAction, normalizeCases, STAFF_ROLES, terminalStatuses, roleLabel } from "@/components/portal/portal-model";
import { copy, FeedbackContext } from "@/components/portal/portal-ui";

/** The portal with its staff work copy (from the server page) available to every queue, work list and case view. */
// Role-specific panels, loaded on demand: a coordinator never downloads My Care, a patient never the clinical review.
const AccountLinkRequest=dynamic(()=>import("@/components/portal/AccountLinkRequest").then(m=>m.AccountLinkRequest));

// The staff queue loads on demand; patients never download it.
const Queue=dynamic(()=>import("@/components/portal/StaffQueue").then(m=>m.Queue));

export function Portal({workCopy,...props}:{locale:Locale;proposalCopy:ProposalCopy;workCopy:WorkCopy}){
  return <WorkCopyProvider copy={workCopy}><PortalView {...props}/></WorkCopyProvider>;
}

/** The queue state for an explicitly chosen staff view (a pick, a deep link or a history step). */
/** The open staff view's own (visible) heading takes the focus when the control that was focused goes away. */
function focusViewHeading(options?:FocusOptions){const heading=document.querySelector<HTMLElement>("#staff-view h2.title");if(heading){heading.tabIndex=-1;heading.focus(options);}}

/**
 * The role's case page, fetched as soon as the role is known (patients never download the staff workspace, and staff
 * never My Care). Once here it renders straight away: a lazy component would suspend on the first "Open" and leave the
 * queue hidden over a blank page while its chunk loads.
 */
function useCaseView(side:"patient"|"staff"|null){
  const [loaded,setLoaded]=useState<{side:string;View:ComponentType<CaseViewProps>}|null>(null);
  useEffect(()=>{
    if(!side)return;let live=true;
    const load=side==="patient"?import("@/components/portal/PatientCaseView").then(m=>m.PatientCaseView):import("@/components/portal/StaffCaseView").then(m=>m.StaffCaseView);
    void load.then(View=>{if(live)setLoaded({side,View});});
    return()=>{live=false;};
  },[side]);
  return loaded?.side===side?loaded.View:null;
}

/** Renders the loaded case page (passed in, so the component itself is never created during render). */
function RoleCaseView({view:View,...props}:CaseViewProps&{view:ComponentType<CaseViewProps>}){return <View {...props}/>;}

function withView(state:QueueState,id:StaffViewId):QueueState{return {...state,view:id,viewChosen:true,tab:id==="team"?"unowned":id==="mine"?"mine":state.tab,page:1};}

function PortalView({locale,proposalCopy}:{locale:Locale;proposalCopy:ProposalCopy}){
  const t=copy[locale];const work=useWorkCopy();const{user,me,loading,meFailed,signIn,signOut,refreshMe}=useAuth();
  // Silent token renewal hands over a new User object every few minutes. Everything keyed on `api` (the queue load,
  // reference data, polling) must not restart for that, so `api` follows the signed-in subject and reads the current
  // token from a ref kept in step before any data effect runs.
  const signedInSubject=user?.profile.sub;
  const accessToken=useRef<string|undefined>(undefined);
  useLayoutEffect(()=>{accessToken.current=user?.access_token;},[user]);
  // Case workspaces come from /api/v1/me. Control Center work lives in the Control Center: an account with only that
  // lands there directly; everyone else reaches it from the account menu. A signed-in account with no workforce
  // workspace is a patient-side account: it opens My Care, where the account is bound to its patient record.
  const views=useMemo(()=>portalViews(me),[me]);
  const workforce=views.some(view=>view!=="patient");
  const controlCenterOnly=!!user&&!workforce&&opensControlCenter(me);
  // An invited workforce person whose activation was refused (STF-02) is not a patient-side account: they finish setup first.
  const awaitingActivation=!!me?.pendingActions.includes("ACTIVATE_ACCOUNT");
  const available=useMemo<RoleKey[]>(()=>workforce?views:me&&!controlCenterOnly&&!awaitingActivation?["patient"]:[],[views,workforce,me,controlCenterOnly,awaitingActivation]);
  const patientView=available.includes("patient");
  const controlCenter=useControlCenterEntry(locale);const router=useRouter();
  useEffect(()=>{if(controlCenterOnly)router.replace(ccHref(locale));},[controlCenterOnly,router,locale]);
  // Virtual clinic: a consultant opens their own; an account that only manages a consultant's clinic lands there.
  // My Care is the patient's first screen: fetch it with the patient's case page (useCaseView).
  useEffect(()=>{if(patientView)void import("@/components/portal/MyCare");},[patientView]);
  const clinicAccess=useVirtualClinics(!!user&&!controlCenterOnly);const hasClinic=clinicAccess.clinics.length>0;
  const[careEntry]=useState(()=>{if(typeof window==="undefined")return false;const q=new URLSearchParams(window.location.search);return q.get("workspace")==="care"||["link","case","continue"].some(k=>q.has(k));});
  const managedClinicLanding=!!user&&!workforce&&!careEntry&&clinicAccess.clinics.some(c=>c.relation==="PRACTICE_MANAGER");
  const deferPatient=!workforce&&!careEntry&&(clinicAccess.loading||managedClinicLanding);
  useEffect(()=>{if(managedClinicLanding)router.replace(virtualClinicHref(locale));},[managedClinicLanding,router,locale]);
  const[active,setActive]=useState<RoleKey|undefined>();const[cases,setCases]=useState<CaseView[]>([]);const[myTasks,setMyTasks]=useState<Task[]>([]);const[workspace,setWorkspace]=useState<Workspace|null>(null);const[documents,setDocuments]=useState<CaseDocument[]>([]);const[doctors,setDoctors]=useState<VerifiedDoctor[]>([]);const[categories,setCategories]=useState<CareCategory[]>([]);const[staff,setStaff]=useState<StaffMember[]>([]);const[share,setShare]=useState<{caseId:string;token:string;whatsapp?:string;email?:string;caseNumber?:string}|null>(null);const[doctorProfile,setDoctorProfile]=useState<DoctorProfile|null>(null);const[coordinatorProfile,setCoordinatorProfile]=useState<StaffProfile|null>(null);const[catalog,setCatalog]=useState<CatalogService[]>([]);const[fxRates,setFxRates]=useState<FxRate[]>([]);const[busy,setBusy]=useState(false);const[notice,setNotice]=useState("");const[error,setError]=useState("");
  const [preferences,setPreferences]=useState<Preferences>({displayName:null,locale:null});
  const [queueState,setQueueState]=useState<QueueState>(initialQueue);
  const queuePosition=useRef(0);const opening=useRef(0);const mutationPending=useRef(false);
  const [documentError,setDocumentError]=useState(false);const [queueLoading,setQueueLoading]=useState(true);const [queueFor,setQueueFor]=useState<string|null>(null);const [landedRole,setLandedRole]=useState<string|null>(null);
  const currentRole=active&&available.includes(active)?active:available[0];
  // The role a case page opens under. It is gone when /me fails (no roles are known then), so an open case waits for a
  // retry instead of rendering under a role this person may no longer hold.
  const caseRole=currentRole&&!["admin","identity"].includes(currentRole)?currentRole:null;
  const CaseViewFor=useCaseView(!caseRole?null:caseRole==="patient"?"patient":"staff");
  useEffect(()=>{const selected=new URLSearchParams(window.location.search).get("role") as RoleKey;if(available.includes(selected))setActive(selected);},[available]);
  const api=useCallback(async<T,>(path:string,init?:RequestInit):Promise<T>=>{const token=accessToken.current;if(!signedInSubject||!token)throw new Error("AUTHENTICATION_REQUIRED");const response=await apiFetchAs(token,path,init);if(!response.ok){const body=await response.json().catch(()=>({message:t.error}));if(body.code===REAUTHENTICATION_REQUIRED){await requestReauthentication(signIn);throw new Error(reauthenticationCopy[locale].required);}throw new Error(body.message??t.error);}return response.status===204?undefined as T:response.json();},[signedInSubject,t.error,signIn]);
  const refresh=useCallback(async(managedBusy=false)=>{if(!currentRole||["admin","identity"].includes(currentRole))return;if(!managedBusy)setBusy(true);setError("");try{const includeTasks=["coordinator","doctor","operations","finance","patient"].includes(currentRole);const[nextCases,nextTasks]=await Promise.all([api<(CaseView|StaffCaseResponse)[]>(`/${currentRole}/cases`),includeTasks?api<Task[]>("/work/mine"):Promise.resolve([])]);setCases(normalizeCases(nextCases));setMyTasks(nextTasks);}catch(e){setError(e instanceof Error?e.message:t.error);}finally{if(!managedBusy)setBusy(false);}},[currentRole,api,t.error]);
  const loadAssignmentHistory=useCallback((caseId:string)=>api<AssignmentHistoryEntry[]>(`/coordinator/cases/${caseId}/assignment-history`),[api]);
  useEffect(()=>{if(!signedInSubject)return;void api<Preferences>("/account/preferences").then(setPreferences).catch(()=>{});},[signedInSubject,api]);
  useEffect(()=>{
    if(!currentRole||["admin","identity"].includes(currentRole)||deferPatient){setQueueLoading(false);return;}
    let cancelled=false;setQueueLoading(true);setCases([]);setMyTasks([]);setError("");
    void Promise.all([api<(CaseView|StaffCaseResponse)[]>(`/${currentRole}/cases`),["coordinator","doctor","operations","finance","patient"].includes(currentRole)?api<Task[]>("/work/mine"):Promise.resolve([])])
      .then(([nextCases,nextTasks])=>{if(!cancelled){setCases(normalizeCases(nextCases));setMyTasks(nextTasks);}}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:t.error);}).finally(()=>{if(!cancelled){setQueueLoading(false);setQueueFor(currentRole);}});
    return()=>{cancelled=true;};
  },[currentRole,api,t.error,deferPatient]);
  // One-shot entry flags. ?signin=1 (header "Sign in", "use your saved details") and ?continue=1 (returning
  // from identity-provider account setup, where a Keycloak session already exists) start sign-in at once so
  // the patient never has to find a button. The flag is stripped from the return path first: a cancelled or
  // failed sign-in lands back here without re-triggering, so there is no redirect loop.
  const autoSignIn=useRef(false);
  useEffect(()=>{if(loading||user||autoSignIn.current)return;const params=new URLSearchParams(window.location.search);if(!params.has("signin")&&!params.has("continue"))return;autoSignIn.current=true;const returnTo=params.get("returnTo");params.delete("signin");params.delete("continue");params.delete("returnTo");const cleaned=`${window.location.pathname}${params.toString()?`?${params}`:""}`;window.history.replaceState({},"",cleaned);void signIn(false,returnTo&&returnTo.startsWith("/")?returnTo:cleaned);},[loading,user,signIn]);
  // Every authenticated patient entry registers the session: the first one after identity-provider setup
  // activates the account, and the answer says which case is current and whether an "is this you?" question waits.
  const [linkToken,setLinkToken]=useState<string|null>(()=>typeof window==="undefined"?null:new URLSearchParams(window.location.search).get("link"));
  const [landed,setLanded]=useState(false);
  // Once per signed-in subject, not per render of its inputs: a linked session refreshes /me, which briefly clears
  // patientView, and re-registering on its return would refresh /me again, forever.
  const sessionRegisteredFor=useRef<string|null>(null);
  useEffect(()=>{if(!user||deferPatient||!patientView)return;const subject=user.profile.sub;if(sessionRegisteredFor.current===subject)return;sessionRegisteredFor.current=subject;const params=new URLSearchParams(window.location.search);const link=params.get("link");if(link){params.delete("link");window.history.replaceState({},"",`${window.location.pathname}${params.toString()?`?${params}`:""}`);}void api<{linked:boolean;currentCaseId:string|null;accountStatus:string}>("/patient/account/session",{method:"POST"}).then(session=>{if(session.linked)refreshMe();if(!params.get("case")&&session.currentCaseId&&!link){const url=new URL(window.location.href);url.searchParams.set("case",session.currentCaseId);window.history.replaceState({},"",url);}}).catch(()=>{}).finally(()=>setLanded(true));},[user,patientView,api,deferPatient,refreshMe]);
  useEffect(()=>{if(currentRole!=="doctor")return;void api<DoctorProfile>("/doctor/me").then(setDoctorProfile).catch(()=>setDoctorProfile(null));void api<CatalogService[]>("/doctor/catalog").then(setCatalog).catch(()=>setCatalog([]));void api<FxRate[]>("/doctor/fx-rates").then(setFxRates).catch(()=>setFxRates([]));},[currentRole,api]);
  useEffect(()=>{if(currentRole!=="coordinator")return;void api<StaffProfile>("/coordinator/me").then(setCoordinatorProfile).catch(()=>setCoordinatorProfile(null));},[currentRole,api]);
  useEffect(()=>{if(currentRole!=="coordinator")return;void api<VerifiedDoctor[]>("/coordinator/doctors").then(setDoctors).catch(()=>setDoctors([]));void api<CareCategory[]>("/coordinator/care-categories").then(setCategories).catch(()=>setCategories([]));void api<FxRate[]>("/coordinator/fx-rates").then(setFxRates).catch(()=>setFxRates([]));void Promise.all([api<StaffMember[]>("/coordinator/staff?role=COORDINATOR"),api<StaffMember[]>("/coordinator/staff?role=OPERATIONS"),api<StaffMember[]>("/coordinator/staff?role=FINANCE")]).then(rows=>setStaff(rows.flat())).catch(()=>setStaff([]));},[currentRole,api]);
  async function openCase(item:CaseView,preloaded?:Workspace,managedBusy=false){
    // While /me reloads there is no role yet; a role-scoped URL would read /undefined/cases/….
    if(!currentRole)return;
    const request=++opening.current;if(!managedBusy)setBusy(true);setError("");setDocumentError(false);
    if(!workspace)queuePosition.current=window.scrollY;
    try{
      if(currentRole==="coordinator"&&!item.coordinatorSubject){
        const preview=await api<{caseSummary:CaseView;intakeSummary?:string}>(`/coordinator/cases/${item.id}/intake-preview`);
        if(request===opening.current){setWorkspace({...preview,preview:true,timeline:[],tasks:[],messages:[],assignments:[],clinicalReviews:[]});setDocuments([]);try{const docs=await api<CaseDocument[]>(`/cases/${item.id}/documents`);if(request===opening.current)setDocuments(docs);}catch{if(request===opening.current)setDocumentError(true);}}
      }else{
        const pending=api<CaseDocument[]>(`/cases/${item.id}/documents`).then(rows=>({rows,failed:false}),()=>({rows:[] as CaseDocument[],failed:true}));
        const ws=preloaded??await api<Workspace>(`/${currentRole}/cases/${item.id}`);
        if(request!==opening.current)return;setWorkspace(ws);setDocuments([]);
        const docs=await pending;if(request===opening.current){setDocuments(docs.rows);if(docs.failed)setDocumentError(true);}
      }
      if(request===opening.current){const url=new URL(window.location.href);url.searchParams.set("case",item.id);window.history.replaceState({},"",url);if(!workspace)requestAnimationFrame(()=>document.getElementById("case-heading")?.focus());}
    }catch(e){if(request===opening.current){setWorkspace(null);setError(e instanceof Error?e.message:t.error);void refresh();}}
    finally{if(request===opening.current&&!managedBusy)setBusy(false);}
  }
  /** Open a case by id (from My Work or a notification), even before the queue has loaded it. */
  async function openCaseById(caseId:string){
    const known=cases.find(item=>item.id===caseId);if(known){await openCase(known);return;}
    // Not in the queue yet — a pending assignment (work, not yet one of my cases) or a case reached from a
    // notification. Resolve the summary first so the coordinator's preview rule can apply, then open it
    // exactly like a queued case: workspace and documents together. A consultant must never be asked to
    // accept or review an assignment without the patient's file in front of them.
    if(!currentRole)return;
    try{const ws=await api<Workspace>(`/${currentRole}/cases/${caseId}`);await openCase(ws.caseSummary,ws);}
    catch(e){setError(e instanceof Error?e.message:t.error);}
  }
  function backToQueue(){opening.current++;setWorkspace(null);setError("");setNotice("");const url=new URL(window.location.href);url.searchParams.delete("case");window.history.replaceState({},"",url);
    // The control that closed the case is gone with it: hand the focus to the view's heading, keeping the scroll position.
    requestAnimationFrame(()=>{window.scrollTo({top:queuePosition.current,behavior:"instant"});focusViewHeading({preventScroll:true});});}
  // Keep only navigation preferences in this browser session, scoped to the signed-in account.
  // Keyed by the subject, not the User object: a silent token renew hands over a new User and must not reset the view.
  const userSubject=user?.profile.sub;
  useEffect(()=>{if(!userSubject||!currentRole)return;let next=initialQueue;try{const saved=sessionStorage.getItem(`portal-queue:${userSubject}:${currentRole}`);if(saved)next={...initialQueue,...JSON.parse(saved)};}catch{}
    // A deep link, a reload or "open in new tab" names the staff view in the URL: that is an explicit choice.
    const linked=currentRole!=="patient"?new URLSearchParams(window.location.search).get("view"):null;
    setQueueState(isStaffViewId(linked)?withView(next,linked):next);},[userSubject,currentRole]);
  function changeQueue(next:QueueState){setQueueState(next);if(user&&currentRole)try{sessionStorage.setItem(`portal-queue:${user.profile.sub}:${currentRole}`,JSON.stringify(next));}catch{}}
  const restored=useRef(false);
  // For patients, wait for the session answer: it may have just pointed ?case= at their current case.
  // Wait for a role too: while /me reloads, the previous answer's cases are still listed but no case can be opened yet.
  useEffect(()=>{if(queueLoading||restored.current||!cases.length||!currentRole)return;if(patientView&&!landed)return;restored.current=true;const id=new URLSearchParams(window.location.search).get("case");
    // A patient never lands on a list: the session named their current case; failing that, the most recent one.
    const item=cases.find(c=>c.id===id)??(patientView?cases[0]:undefined);if(item)void openCase(item);});
  // The patient's three destinations are one page with a view switch, kept in the URL so a reload or a shared link lands in the same place.
  const [careView,setCareView]=useState<CareView>(()=>{if(typeof window==="undefined")return "care";const v=new URLSearchParams(window.location.search).get("view");return v==="documents"||v==="messages"?v:"care";});
  const changeCareView=(view:CareView)=>{setCareView(view);const url=new URL(window.location.href);if(view==="care")url.searchParams.delete("view");else url.searchParams.set("view",view);window.history.replaceState({},"",url);requestAnimationFrame(()=>document.getElementById("case-heading")?.focus());};
  async function downloadDoc(id:string){setError("");try{const res=await api<{downloadUrl:string}>(`/documents/${id}/download`);if(res?.downloadUrl)window.open(res.downloadUrl,"_blank","noopener,noreferrer");}catch(e){setError(e instanceof Error?e.message:t.error);}}
  async function viewDoc(id:string){setError("");try{const res=await api<{downloadUrl:string}>(`/documents/${id}/view`);if(res?.downloadUrl)window.open(res.downloadUrl,"_blank","noopener,noreferrer");}catch(e){setError(e instanceof Error?e.message:t.error);}}
  async function sendProposal(caseId:string,body:unknown){setBusy(true);setError("");setNotice("");try{await api(`/coordinator/cases/${caseId}/proposals`,{method:"POST",body:JSON.stringify(body)});setShare(null);setNotice(t.success);if(workspace)await openCase(workspace.caseSummary);}catch(e){setError(e instanceof Error?e.message:t.error);}finally{setBusy(false);}}
  async function mutate(path:string,body?:unknown,method="POST"):Promise<MutationResult|undefined>{
    if(mutationPending.current)return;mutationPending.current=true;setBusy(true);setError("");setNotice("");
    const origin=document.activeElement instanceof HTMLElement&&document.activeElement!==document.body?document.activeElement:null;
    try{const result=await api<MutationResult>(path,{method,body:body===undefined?undefined:JSON.stringify(body)});setNotice(t.success);
      await Promise.all([refresh(true),workspace?openCase(path.endsWith("/claim")?{...workspace.caseSummary,coordinatorSubject:user?.profile.sub}:workspace.caseSummary,undefined,true):undefined]);
      // What the form that acted now shows is what was saved, once the reloaded case has rendered.
      requestAnimationFrame(()=>rebaseline(origin));
      return result??{status:"SAVED"};
    }catch(e){const message=e instanceof Error?e.message:t.error;if(path.endsWith("/claim"))setWorkspace(null);await refreshAfterRejectedAction(path,workspace,refresh,openCase);setError(message);return undefined;}
    finally{mutationPending.current=false;setBusy(false);}
  }
  // Staff views (My work, My cases, Team queue) in one place: the header navigation, the inline phone navigation and
  // the landing rule all read the same items and counts.
  const staffViews=currentRole&&STAFF_ROLES.includes(currentRole)?staffViewItems(currentRole,cases,myTasks,user?.profile?.sub,work.nav):null;
  const staffView=staffViews?resolveStaffView(queueState.view,staffViews.items):null;
  // Land on the first view that has work (owner decision, GATE P2-2), once per role and only on that role's loaded
  // data. A view the person picked wins, and the landing itself is not saved as a choice.
  if(staffViews&&currentRole&&queueFor===currentRole&&!queueLoading&&landedRole!==currentRole){
    setLandedRole(currentRole);
    const next=staffViews.items.find(item=>staffViews.counts[item.id]>0)?.id??"work";
    if(!queueState.viewChosen&&next!==queueState.view)setQueueState({...queueState,view:next,tab:next==="team"?"unowned":next==="mine"?"mine":queueState.tab,page:1});
  }
  // Unsent text in the open case: leaving asks first (plans/portal-p2-pass-3.md §1).
  const workspaceRoot=useRef<HTMLDivElement>(null);
  const {hasDraft,rebaseline}=useDraftWatch(workspaceRoot,CaseViewFor&&workspace?workspace.caseSummary.id:null);
  const [leaveTo,setLeaveTo]=useState<(()=>void)|null>(null);
  const guardLeave=(go:()=>void)=>{if(workspace&&hasDraft())setLeaveTo(()=>go);else go();};
  const caseOpen=!!workspace;
  useEffect(()=>{if(!caseOpen)return;const onUnload=(event:BeforeUnloadEvent)=>{if(hasDraft()){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",onUnload);return()=>window.removeEventListener("beforeunload",onUnload);},[caseOpen,hasDraft]);
  /** Staff views live in the URL (`?view=`), so Back/Forward, deep links and new tabs reach them. */
  function showStaffView(id:StaffViewId,fromCase:boolean,push=true){
    if(fromCase)backToQueue();
    changeQueue(withView(queueState,id));
    const url=new URL(window.location.href);url.searchParams.delete("case");url.searchParams.set("view",id);
    if(push&&staffView&&!new URLSearchParams(window.location.search).has("view")){const here=new URL(window.location.href);here.searchParams.delete("case");here.searchParams.set("view",staffView);window.history.replaceState({},"",here);}
    if(push&&url.search!==window.location.search)window.history.pushState({},"",url);
    // From inside a case the focus would stay in the header: move it to the view's heading.
    if(fromCase)requestAnimationFrame(()=>focusViewHeading());
  }
  function selectStaffView(id:StaffViewId){if(workspace)guardLeave(()=>showStaffView(id,true));else showStaffView(id,false);}
  const viewHref=(id:StaffViewId)=>{const q=new URLSearchParams();if(active&&currentRole)q.set("role",currentRole);q.set("view",id);return `?${q}`;};
  // Back/Forward between views and cases: the URL says where to be; leaving a case with a draft still asks.
  const onHistory=useRef<()=>void>(()=>{});const skipGuard=useRef(false);
  useEffect(()=>{onHistory.current=()=>{
    if(!currentRole||currentRole==="patient"||!staffViews)return;
    const params=new URLSearchParams(window.location.search);const caseId=params.get("case");const view=params.get("view");
    // An entry made under another working role belongs to that role's queue: this one leaves it alone.
    const role=params.get("role");if(role&&role!==currentRole)return;
    const apply=()=>{if(caseId){if(workspace?.caseSummary.id!==caseId)void openCaseById(caseId);return;}
      if(workspace)backToQueue();if(isStaffViewId(view))changeQueue(withView(queueState,view));};
    if(skipGuard.current){skipGuard.current=false;apply();return;}
    if(workspace&&caseId===workspace.caseSummary.id)return; // back on the case itself (the step forward below)
    if(workspace&&hasDraft()){
      // Undo the step while the person decides, without adding an entry; "Leave" takes the same step again.
      if(!leaveTo){window.history.forward();setLeaveTo(()=>()=>{skipGuard.current=true;window.history.back();});}
      return;
    }
    apply();
  };});
  useEffect(()=>{const listener=()=>onHistory.current();window.addEventListener("popstate",listener);return()=>window.removeEventListener("popstate",listener);},[]);
  function changeRole(role:RoleKey){setActive(role);setWorkspace(null);setCases([]);setMyTasks([]);restored.current=false;const url=new URL(window.location.href);url.searchParams.delete("case");url.searchParams.delete("view");url.searchParams.set("role",role);window.history.replaceState({},"",url);}
  function switchRole(role:RoleKey){guardLeave(()=>changeRole(role));}
  const clinicLink=hasClinic?{href:virtualClinicHref(locale),label:work.nav.clinic}:null;
  const clearFeedback=useCallback(()=>{setNotice("");setError("");},[]);const clearNotice=useCallback(()=>setNotice(""),[]);
  if(loading)return <PortalFrame title={t.title} subtitle={t.loading}/>;
  if(controlCenterOnly)return <PortalFrame title={t.title} subtitle={locale==="ar"?"جارٍ فتح مركز التحكم…":"Opening the Control Center…"}/>;
  if(user&&!workforce&&!careEntry&&clinicAccess.loading)return <PortalFrame title={t.title} subtitle={t.loading}/>;
  if(!user)return <PortalFrame title={t.title} subtitle={t.subtitle}><div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"><div className="card p-6 sm:p-8"><p className="eyebrow">{locale==="ar"?"مساحة خاصة ومحمية":"Private, protected space"}</p><h2 className="title mt-3">{locale==="ar"?"سجّل الدخول للوصول إلى حالتك":"Sign in to open your case"}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">{locale==="ar"?"للمرضى الذين أكملوا ملفهم وفعّلوا حسابهم، وللفريق الطبي والتنسيقي. بعد الدخول تصل مباشرة إلى حالتك الحالية وخطوتها التالية.":"For patients who completed their profile and set up their account, and for the care team. After signing in you land directly on your current case and its next step."}</p><div className="mt-6 flex flex-col gap-3 sm:flex-row"><button className="btn-primary" onClick={()=>void signIn()}>{t.signIn}</button><a className="btn-secondary" href={locale==="ar"?"/en/portal":"/ar/portal"} lang={locale==="ar"?"en":"ar"}>{locale==="ar"?"English":"العربية"}</a></div><p className="mt-5 border-t border-line pt-4 text-sm leading-6 text-ink-500">{locale==="ar"?"أرسلت حالتك ولم تفعّل حسابك بعد؟ ":"Sent a case but haven't set up your account yet? "}<a className="font-semibold text-brand-700 underline underline-offset-4" href={`/${locale}/track-case`}>{locale==="ar"?"تابع حالتك عبر الرابط الآمن":"Check your case status with your secure link"}</a>{locale==="ar"?" — أما الحساب فتُنشئه عند إكمال ملفك بعد قبول العرض.":" — your account is created when you complete your profile after accepting a proposal."}</p></div><aside className="surface-muted p-6"><h2 className="font-bold text-brand-900">{locale==="ar"?"حماية الوصول":"Secure access"}</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-ink-600"><li>✓ {locale==="ar"?"تسجيل دخول موحّد وآمن":"Secure single sign-on"}</li><li>✓ {locale==="ar"?"صلاحيات منفصلة لكل دور":"Role-specific access"}</li><li>✓ {locale==="ar"?"المستندات الطبية ليست عامة":"Medical files are never public"}</li></ul><p className="mt-5 border-t border-line pt-4 text-[0.8125rem] leading-5 text-ink-500">{locale==="ar"?"إذا لم تتمكن من الدخول، تواصل مع منسقك أو مسؤول النظام دون مشاركة كلمة المرور.":"If you cannot sign in, contact your coordinator or system administrator without sharing your password."}</p></aside></div></PortalFrame>;
  const profile=user.profile as {name?:string;preferred_username?:string;email?:string;sub?:string};
  const accountName=profile.name??profile.preferred_username??profile.email??profile.sub??"";
  const isDoctorRole=currentRole==="doctor";
  const profileName=isDoctorRole?doctorProfile?.displayName:currentRole==="coordinator"?coordinatorProfile?.displayName:undefined;
  const baseName=preferences.displayName||profileName||accountName;
  const displayName=isDoctorRole&&profileName&&!/^d(r|octor)\b/i.test(baseName)?`Dr. ${baseName}`:baseName;
  const descriptions:Record<RoleKey,string>=locale==="ar"?{coordinator:"راجع الحالات ونسّق الخطوة التالية للرعاية.",doctor:"راجع الحالات المسندة إليك وسجّل قراراتك السريرية.",operations:"تابع الترتيبات والإجراءات المطلوبة منك.",finance:"راجع المدفوعات والموافقات المطلوبة.",patient:"تابع رعايتك وتعرّف على الخطوة التالية."}:{coordinator:"Review cases and coordinate the next step in care.",doctor:"Review assigned cases and record your clinical decisions.",operations:"Manage your assigned care and travel arrangements.",finance:"Review payments and commercial approvals that need your attention.",patient:"Follow your care and see what happens next."};
  const inWorkspace=!!workspace&&!!caseRole;
  const isPatientRole=currentRole==="patient";
  return <FeedbackContext.Provider value={{notice,error,clear:clearFeedback,clearNotice}}><PortalFrame title={isPatientRole?(locale==="ar"?"رعايتي":"My Care"):currentRole?roleLabel(currentRole,locale):t.title} subtitle={inWorkspace||isPatientRole?"":currentRole?descriptions[currentRole]:t.subtitle}>
    {currentRole&&!["admin","identity","patient"].includes(currentRole)&&<NotificationBell locale={locale} api={api} onOpenCase={caseId=>workspace&&workspace.caseSummary.id!==caseId?guardLeave(()=>void openCaseById(caseId)):void openCaseById(caseId)}/>}
    {staffViews&&<StaffNav locale={locale} label={work.nav.label} items={staffViews.items} current={workspace?null:staffView} clinic={clinicLink} onSelect={selectStaffView} hrefFor={viewHref}/>}
    {isPatientRole&&workspace&&<PatientNav locale={locale} view={careView} unread={workspace.messages.filter(m=>m.senderRole!=="PATIENT"&&!m.read).length} onView={changeCareView}/>}
    <PortalAccount locale={locale} name={displayName} email={profile.email} role={currentRole?roleLabel(currentRole,locale):""} api={api} signOut={signOut} preferences={preferences} onSaved={value=>{setPreferences(value);setNotice(t.success);}} patient={isPatientRole} controlCenter={controlCenter}
      roles={available.length>1?{label:work.nav.workingAs,current:currentRole,options:available.map(role=>({key:role,label:roleLabel(role,locale)})),onSelect:key=>switchRole(key as RoleKey)}:null}/>
    {/* A patient-side account that also manages a clinic keeps its one way in; staff reach it from the navigation. */}
    {isPatientRole&&clinicLink&&<p className="mb-6"><a className="btn-secondary" href={clinicLink.href}>{clinicLink.label}</a></p>}
    <ReauthenticationReturnNotice locale={locale} className="mb-4 rounded-lg bg-brand-50 p-4 text-brand-800"/>
    {!available.length&&<NoPortalWorkspace locale={locale}/>}
    {linkToken&&currentRole==="patient"&&<AccountLinkRequest locale={locale} token={linkToken} api={api} onResolved={()=>{setLinkToken(null);restored.current=false;void refresh();}}/>}
    {meFailed&&<div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-alert-50 p-4 text-alert-800"><span>{work.accessUnavailable.message}</span><button type="button" className="btn-secondary !px-3 !text-[0.82rem]" onClick={refreshMe}>{work.accessUnavailable.retry}</button></div>}
    {notice&&<p role="status" className="mb-4 rounded-lg bg-brand-50 p-4 text-brand-800">{notice}</p>}{error&&<div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-alert-50 p-4 text-alert-800"><span>{error}</span><button type="button" className="btn-secondary !px-3 !text-[0.82rem]" onClick={()=>{setError("");void refresh();}}>{locale==="ar"?"إعادة المحاولة":"Retry"}</button></div>}
    {leaveTo&&<LeaveCaseDialog onStay={()=>setLeaveTo(null)} onLeave={()=>{const go=leaveTo;setLeaveTo(null);go();}}/>}
    {busy&&workspace&&<p role="status" className="mb-3 text-sm text-ink-500">{t.loading}</p>}
    {documentError&&workspace&&<p role="alert" className="mb-4 rounded-lg bg-alert-50 p-4 text-sm text-alert-800">{locale==="ar"?"تعذّر تحميل المستندات.":"Documents could not be loaded."} <button className="link-cta" onClick={()=>void openCase(workspace.caseSummary)}>{locale==="ar"?"إعادة المحاولة":"Retry"}</button></p>}
    {workspace
        // Keyed by case: opening another case straight from a notification or My Work must not carry this case's
        // drafts, tab or open dialogs into it (or let them be submitted against the wrong patient's case).
        ? !caseRole||!CaseViewFor ? (meFailed?null:<p role="status" className="text-sm text-ink-500">{t.loading}</p>) : <div ref={workspaceRoot}><RoleCaseView view={CaseViewFor} key={workspace.caseSummary.id} locale={locale} t={t} proposalCopy={proposalCopy} role={caseRole} value={workspace} documents={documents} doctors={doctors} categories={categories} staff={staff} catalog={catalog} fxRates={fxRates} canRebalance={leadsTeam(me,"CARE_COORDINATION")} loadAssignmentHistory={loadAssignmentHistory} load={api} downloadDoc={downloadDoc} viewDoc={viewDoc} mySubject={user?.profile?.sub} share={share&&share.caseId===workspace.caseSummary.id?share:null} sendProposal={sendProposal} busy={busy} back={()=>guardLeave(backToQueue)} mutate={mutate} careView={careView} onCareView={changeCareView} otherCases={cases} openCaseById={id=>id!==workspace.caseSummary.id?guardLeave(()=>void openCaseById(id)):undefined} consultantsHref={holds(me,"CREDENTIAL_READ")?ccHref(locale,"/consultants"):null}/></div>
        : isPatientRole ? (queueLoading||(!landed&&patientView)||(cases.length>0&&!error)
          ? <p role="status" className="text-sm text-ink-500">{t.loading}</p>
          : <PatientNoCase locale={locale}/>)
        : null}
    {currentRole&&!["admin","identity","patient"].includes(currentRole)&&<div id="staff-view" hidden={!!workspace}><Queue viewHref={viewHref} views={staffViews?.items??[]} view={staffView??"work"} onSelectView={selectStaffView} clinic={clinicLink} loading={queueLoading||queueFor!==currentRole} queueState={queueState} changeQueue={changeQueue} locale={locale} role={currentRole} openCaseById={openCaseById} cases={cases} tasks={myTasks} busy={busy||queueLoading} mySubject={user?.profile?.sub} coordinatorLead={leadsTeam(me,"CARE_COORDINATION")} staff={staff} openCase={openCase} mutate={mutate}/></div>}

    {currentRole==="finance"&&!workspace&&holds(me,"COMMERCIAL_POLICY_READ")&&<p className="mt-8 text-sm text-ink-600"><a className="font-semibold text-brand-700 underline underline-offset-4" href={ccHref(locale,"/commercial/margin-deposit")}>{locale==="ar"?"سياسات الهامش والدفعة المقدمة":"Margin & deposit policies"}</a>{locale==="ar"?" — في مركز التحكم":" — in the Control Center"}</p>}
  </PortalFrame></FeedbackContext.Provider>;
}

/** A signed-in patient with no case yet: one calm sentence and the one thing they can do. */
function PatientNoCase({locale}:{locale:Locale}){
 const ar=locale==="ar";
 return <section className="card mx-auto max-w-2xl p-6 sm:p-8" aria-labelledby="no-case-title">
  <h2 id="no-case-title" className="text-[1.15rem] font-bold text-brand-900">{ar?"لا توجد حالة نشطة بعد":"No active case yet"}</h2>
  <p className="mt-2 text-[0.95rem] leading-7 text-ink-600">{ar?"عندما ترسل حالة، تظهر رحلة رعايتك هنا: ما يحدث الآن، وما إذا كان مطلوبًا منك شيء، وما الخطوة التالية.":"When you send a case, your care journey appears here: what is happening now, whether we need anything from you, and what happens next."}</p>
  <a className="btn-primary mt-5 inline-flex" href={`/${locale}/send-my-case`}>{ar?"إرسال حالتي":"Send my case"}</a>
 </section>;
}

function PortalFrame({title,subtitle,children}:{title:string;subtitle:string;children?:React.ReactNode}){return <section className="portal-shell bg-[linear-gradient(180deg,var(--color-mist)_0%,#fff_32rem)]"><div className="container-site"><h1 className="headline">{title}</h1>{subtitle&&<p className="mt-2 max-w-3xl text-sm text-ink-600">{subtitle}</p>}<div className="mt-6">{children}</div></div></section>}

/** The staff views in order with the counts that decide where the home lands. My cases shows no count: it is accountability, not a to-do. */
function staffViewItems(role:string,cases:CaseView[],tasks:Task[],subject:string|undefined,nav:WorkCopy["nav"]){
  const coordinator=role==="coordinator";
  const counts:Record<StaffViewId,number>={work:tasks.length,mine:cases.filter(item=>!terminalStatuses.has(item.status)&&(!coordinator||ownershipTab(item,subject)==="mine")).length,team:coordinator?cases.filter(item=>matchesKpi(item,"unowned","coordinator")).length:0};
  const items:StaffViewItem[]=[{id:"work",label:nav.work,count:counts.work},{id:"mine",label:nav.mine},...(coordinator?[{id:"team" as const,label:nav.team,count:counts.team}]:[])];
  return {items,counts};
}

const resolveStaffView=(view:string,items:StaffViewItem[]):StaffViewId=>items.find(item=>item.id===view)?.id??"work";
