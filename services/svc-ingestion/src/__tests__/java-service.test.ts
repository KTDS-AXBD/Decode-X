import { describe, test, expect } from "vitest";
import { parseJavaService, isService } from "../parsing/java-service.js";

describe("java-service parser", () => {
  test("LPON ServiceImpl with @Transactional", () => {
    const source = `
package com.kt.onnuripay.service.impl;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentServiceImpl implements PaymentService {
    @Transactional
    public ResponseEntity<BaseGenericRes<String>> processPayment(PaymentReq request) {
        return null;
    }

    @Transactional(readOnly = true)
    public List<PaymentVO> getPaymentHistory(String accountNo) {
        return null;
    }

    public void internalHelper() {
        // no @Transactional
    }
}
    `;
    const result = parseJavaService(source, "PaymentServiceImpl.java");
    expect(result).toHaveLength(2);

    expect(result[0]!.className).toBe("PaymentServiceImpl");
    expect(result[0]!.methodName).toBe("processPayment");
    expect(result[0]!.isTransactional).toBe(true);
    expect(result[0]!.readOnly).toBe(false);
    expect(result[0]!.parameters).toHaveLength(1);
    expect(result[0]!.parameters[0]!.type).toBe("PaymentReq");

    expect(result[1]!.methodName).toBe("getPaymentHistory");
    expect(result[1]!.isTransactional).toBe(true);
    expect(result[1]!.readOnly).toBe(true);
  });

  test("isService detection", () => {
    expect(isService("@Service\npublic class Foo {}")).toBe(true);
    expect(isService("@RestController\npublic class Bar {}")).toBe(false);
    expect(isService("public class Plain {}")).toBe(false);
  });

  test("empty result for non-service", () => {
    const source = `
@RestController
public class MyController {
    @GetMapping("/test")
    public String test() { return "ok"; }
}
    `;
    expect(parseJavaService(source, "MyController.java")).toHaveLength(0);
  });
});
