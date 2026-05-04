package com.ktds.lpon.payment.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * LPON 충전 서비스 — 샘플 2 (service with @Transactional)
 * regex 케이스: @Service 감지는 되지만 @Transactional 세부정보(rollbackFor) 손실
 */
@Service
public class LponChargeService {

    @Transactional
    public ChargeResult processCharge(String accountNo, long amount) {
        // business logic
        return null;
    }

    @Transactional(readOnly = true)
    public BalanceInfo getBalance(String accountNo) {
        return null;
    }

    @Transactional(rollbackFor = { PaymentException.class, DatabaseException.class })
    public void bulkCharge(java.util.List<ChargeRequest> requests) {
        // bulk processing
    }
}
