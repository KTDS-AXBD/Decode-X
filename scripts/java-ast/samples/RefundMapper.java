package com.ktds.lpon.refund.mapper;

import org.apache.ibatis.annotations.*;
import java.util.List;

/**
 * LPON 환불 매퍼 인터페이스 — 샘플 5 (MyBatis interface — regex silent skip)
 * regex 실패 케이스:
 *   1. interface 타입 미처리 → regex 완전 누락 (DataModel도 아니고 Controller도 아님)
 *   2. @Select/@Insert/@Update 어노테이션 무시
 *   3. 메서드 반환타입 generic 손실
 */
@Mapper
public interface LponRefundMapper {

    @Select("SELECT * FROM lpon_refund WHERE account_no = #{accountNo} AND status = #{status}")
    List<RefundRecord> findByAccountAndStatus(
            @Param("accountNo") String accountNo,
            @Param("status") String status);

    @Insert("INSERT INTO lpon_refund (account_no, amount, reason, status) VALUES (#{accountNo}, #{amount}, #{reason}, 'PENDING')")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int createRefund(RefundRequest request);

    @Update("UPDATE lpon_refund SET status = #{status}, updated_at = NOW() WHERE id = #{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);

    @Select("SELECT COUNT(*) FROM lpon_refund WHERE account_no = #{accountNo} AND created_at >= #{since}")
    int countSince(@Param("accountNo") String accountNo, @Param("since") java.time.LocalDateTime since);
}
