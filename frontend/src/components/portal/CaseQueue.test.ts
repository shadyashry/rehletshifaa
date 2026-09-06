import {describe,expect,it} from "vitest";
import {filterQueue,initialQueue,type QueueCase} from "./CaseQueue";

const cases:QueueCase[]=[
  {id:"1",caseNumber:"RS-1",patientName:"A",status:"INTAKE_REVIEW",country:"Egypt",careCategory:"cardiology",coordinatorSubject:"c1",coordinatorName:"Mona",doctorName:"Dr A",createdAt:"2026-01-01T10:00:00Z",updatedAt:"2026-02-01T10:00:00Z"},
  {id:"2",caseNumber:"RS-2",patientName:"B",status:"RECEIVED",country:"UAE",careCategory:"orthopedics",createdAt:"2026-03-01T10:00:00Z",updatedAt:"2026-01-01T10:00:00Z"},
];

describe("filterQueue",()=>{
  it("combines managed filters",()=>{const state={...initialQueue,tab:"mine",country:"Egypt",careArea:"cardiology",consultant:"Dr A"};expect(filterQueue(cases,state,true,"c1").map(item=>item.id)).toEqual(["1"]);});
  it("filters date ranges and sorts by creation",()=>{const state={...initialQueue,status:"all",createdFrom:"2026-02-01",sort:"created-desc"};expect(filterQueue(cases,state,false).map(item=>item.id)).toEqual(["2"]);});
});
