package com.ktds.lpon.payment.domain;

import javax.persistence.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * LPON 결제 엔티티 — 샘플 3 (JPA entity with generic/complex field types)
 * regex 케이스: List<PaymentHistory>, Map<String, Object> 등 generic 타입 손실
 */
@Entity
@Table(name = "lpon_payment")
@Data
public class LponPaymentEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "account_no", nullable = false)
    private String accountNo;

    @Column(name = "amount", precision = 15, scale = 2)
    private BigDecimal amount;

    @Column(name = "status")
    private PaymentStatus status;

    @OneToMany(mappedBy = "payment", cascade = CascadeType.ALL)
    private List<PaymentHistory> histories;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "metadata")
    private java.util.Map<String, Object> metadata;
}
