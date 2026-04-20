package com.ktds.lpon.payment.controller;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/lpon/payment")
public class LponPaymentController {

    @PostMapping("/charge")
    public Object charge(@RequestBody ChargeRequest request) {
        return null;
    }

    @GetMapping("/balance/{accountNo}")
    public Object getBalance(@PathVariable String accountNo) {
        return null;
    }

    @PostMapping("/cancel")
    public Object cancel(@RequestBody CancelRequest request, @RequestParam String reason) {
        return null;
    }
}
