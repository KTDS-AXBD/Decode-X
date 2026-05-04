package com.ktds.lpon.withdrawal.controller;

import org.springframework.web.bind.annotation.*;

/**
 * LPON 출금 컨트롤러 — 샘플 4 (complex: value= annotation format + multi-level mapping)
 * regex 실패 케이스:
 *   1. @RequestMapping base path "/api/v1/lpon/withdrawal" 미결합
 *   2. @GetMapping(value = "/status/{txId}") value= 형식 불안정
 *   3. @PostMapping({"/initiate", "/submit"}) multi-path (regex는 첫 번째만)
 */
@RestController
@RequestMapping(value = "/api/v1/lpon/withdrawal", produces = "application/json")
public class LponWithdrawalController {

    @PostMapping(value = "/initiate")
    public ResponseEntity<WithdrawalResponse> initiateWithdrawal(
            @RequestBody WithdrawalRequest request,
            @RequestHeader("X-Org-Id") String orgId) {
        return null;
    }

    @GetMapping(value = "/status/{txId}")
    public ResponseEntity<WithdrawalStatus> getStatus(@PathVariable String txId) {
        return null;
    }

    @PostMapping({ "/confirm", "/approve" })
    public ResponseEntity<Void> confirm(@RequestBody ConfirmRequest request) {
        return null;
    }

    @DeleteMapping(value = "/cancel/{txId}")
    public ResponseEntity<Void> cancel(@PathVariable String txId) {
        return null;
    }
}
