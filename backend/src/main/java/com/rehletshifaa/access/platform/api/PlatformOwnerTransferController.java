package com.rehletshifaa.access.platform.api;

import com.rehletshifaa.access.platform.application.PlatformOwnerTransferService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/platform-access/owner-transfers")
public class PlatformOwnerTransferController {
    private final PlatformOwnerTransferService transfers;

    public PlatformOwnerTransferController(PlatformOwnerTransferService transfers) { this.transfers = transfers; }

    @GetMapping
    public Object overview() { return transfers.overview(); }

    @PostMapping
    public Object initiate(@RequestBody PlatformOwnerTransferService.Initiate command) {
        return transfers.initiate(command);
    }

    @PostMapping("/{id}/accept")
    public Object accept(@PathVariable UUID id, @RequestBody PlatformOwnerTransferService.Decision command) {
        return transfers.accept(id, command);
    }

    @PostMapping("/{id}/reject")
    public Object reject(@PathVariable UUID id, @RequestBody PlatformOwnerTransferService.Decision command) {
        return transfers.reject(id, command);
    }

    @PostMapping("/{id}/verify")
    public Object verify(@PathVariable UUID id, @RequestBody PlatformOwnerTransferService.Decision command) {
        return transfers.verify(id, command);
    }
}
