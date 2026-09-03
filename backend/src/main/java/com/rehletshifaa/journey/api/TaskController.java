package com.rehletshifaa.journey.api;

import com.rehletshifaa.journey.application.JourneyService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

import static com.rehletshifaa.journey.api.JourneyDtos.*;

@RestController
@RequestMapping("/api/v1/tasks")
public class TaskController {
    private final JourneyService service;
    public TaskController(JourneyService service){this.service=service;}

    @GetMapping("/mine") public List<TaskView> mine(){return service.myTasks();}
    @PostMapping("/{taskId}/cases/{caseId}/start") public IdResponse start(@PathVariable UUID caseId,@PathVariable UUID taskId,@Valid @RequestBody TaskVersionRequest request){return service.startTask(caseId,taskId,request);}
    @PostMapping("/{taskId}/cases/{caseId}/complete") public IdResponse complete(@PathVariable UUID caseId,@PathVariable UUID taskId,@Valid @RequestBody CompleteTaskRequest request){return service.completeTask(caseId,taskId,request);}
    @PostMapping("/{taskId}/cases/{caseId}/cancel") public IdResponse cancel(@PathVariable UUID caseId,@PathVariable UUID taskId,@Valid @RequestBody CancelTaskRequest request){return service.cancelTask(caseId,taskId,request);}
    @PostMapping("/{taskId}/cases/{caseId}/reassign") public IdResponse reassign(@PathVariable UUID caseId,@PathVariable UUID taskId,@Valid @RequestBody ReassignTaskRequest request){return service.reassignTask(caseId,taskId,request);}
}
