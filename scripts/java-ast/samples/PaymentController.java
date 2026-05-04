package com.ktds.lpon.payment.controller;

import org.springframework.web.bind.annotation.*;
import java.util.List;

/**
 * LPON 결제 컨트롤러 — 샘플 1 (simple controller with base path)
 * regex 실패 케이스: @RequestMapping base path "/api/v1/lpon/payment" 미결합
 */
@RestController
@RequestMapping("/api/v1/lpon/payment")
public class LponPaymentController {

    @PostMapping("/charge")
    public ResponseEntity<ChargeResponse> charge(@RequestBody ChargeRequest request) {
        return null;
    }

    @GetMapping("/balance/{accountNo}")
    public ResponseEntity<BalanceResponse> getBalance(@PathVariable String accountNo) {
        return null;
    }

    @PostMapping("/cancel")
    public ResponseEntity<Void> cancel(
            @RequestBody CancelRequest request,
            @RequestParam String reason) {
        return null;
    }

    @GetMapping("/history")
    public ResponseEntity<List<PaymentHistory>> getHistory(
            @RequestParam String accountNo,
            @RequestParam(required = false) Integer limit) {
        return null;
    }
}
