package com.rehletshifaa.provider.api;

import com.rehletshifaa.provider.application.ProviderWorkspaceService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** V-11: the caller's own provider practice context. Self only — no subject or organization parameter. */
@RestController
@RequestMapping("/api/v1/provider-workspace")
public class ProviderWorkspaceController {
    private final ProviderWorkspaceService workspace;
    public ProviderWorkspaceController(ProviderWorkspaceService workspace){this.workspace=workspace;}
    @GetMapping("/me") public ResponseEntity<ProviderWorkspaceService.PracticeView> mine(){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(workspace.mine());}
}
