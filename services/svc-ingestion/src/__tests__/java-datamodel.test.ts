import { describe, test, expect } from "vitest";
import { parseJavaDataModel, isDataModel } from "../parsing/java-datamodel.js";

describe("java-datamodel parser", () => {
  test("LPON BalanceVO - Lombok @Data with private fields", () => {
    const source = `
package com.kt.onnuripay.model;

import lombok.Data;

@Data
public class BalanceVO {
    private String accountNo;
    private Long balance;
    private String currency;
    // 잔액 유형
    private String balanceType;
}
    `;
    const result = parseJavaDataModel(source, "BalanceVO.java");
    expect(result).not.toBeNull();
    expect(result!.className).toBe("BalanceVO");
    expect(result!.packageName).toBe("com.kt.onnuripay.model");
    expect(result!.modelType).toBe("vo");
    expect(result!.fields).toHaveLength(4);

    expect(result!.fields[0]!.name).toBe("accountNo");
    expect(result!.fields[0]!.type).toBe("String");
    expect(result!.fields[0]!.nullable).toBe(true);

    expect(result!.fields[1]!.name).toBe("balance");
    expect(result!.fields[1]!.type).toBe("Long");

    // Comment on preceding line
    expect(result!.fields[3]!.name).toBe("balanceType");
    expect(result!.fields[3]!.comment).toBe("잔액 유형");
  });

  test("DTO classification by filename", () => {
    const source = `
package com.example;
import lombok.Data;
@Data
public class PaymentDto {
    private String txId;
    private Long amount;
}
    `;
    const result = parseJavaDataModel(source, "PaymentDto.java");
    expect(result).not.toBeNull();
    expect(result!.modelType).toBe("dto");
  });

  test("Request/Response classification", () => {
    const reqSource = `
package com.example;
import lombok.Data;
@Data
public class PaymentReq {
    private String orderId;
}
    `;
    const resSource = `
package com.example;
import lombok.Data;
@Data
public class PaymentRes {
    private String status;
}
    `;
    expect(parseJavaDataModel(reqSource, "PaymentReq.java")!.modelType).toBe("request");
    expect(parseJavaDataModel(resSource, "PaymentRes.java")!.modelType).toBe("response");
  });

  test("JPA Entity with @Table and @Column", () => {
    const source = `
package com.example.entity;

import javax.persistence.*;

@Entity
@Table(name = "payment_history")
public class PaymentHistory {
    @Id
    @Column(nullable = false)
    private Long id;

    @Column(nullable = false)
    private String orderId;

    private String memo;
}
    `;
    const result = parseJavaDataModel(source, "PaymentHistory.java");
    expect(result).not.toBeNull();
    expect(result!.modelType).toBe("entity");
    expect(result!.tableName).toBe("payment_history");

    const idField = result!.fields.find((f) => f.name === "id");
    expect(idField).toBeDefined();
    expect(idField!.annotation).toContain("@Id");
    expect(idField!.nullable).toBe(false);

    const memoField = result!.fields.find((f) => f.name === "memo");
    expect(memoField!.nullable).toBe(true);
    expect(memoField!.annotation).toBeUndefined();
  });

  test("isDataModel detection", () => {
    expect(isDataModel("BalanceVO.java", "public class BalanceVO {}")).toBe(true);
    expect(isDataModel("PaymentDto.java", "public class PaymentDto {}")).toBe(true);
    expect(isDataModel("MyService.java", "@Service\npublic class MyService {}")).toBe(false);
    expect(isDataModel("Config.java", "@Configuration\npublic class Config {}")).toBe(false);
  });

  test("null for class with no fields", () => {
    const source = `
package com.example;
@Data
public class EmptyVO {
}
    `;
    expect(parseJavaDataModel(source, "EmptyVO.java")).toBeNull();
  });

  test("skips static final constants", () => {
    const source = `
package com.example;
import lombok.Data;
@Data
public class ConfigVO {
    private static final long serialVersionUID = 1L;
    public static final String TYPE = "CONFIG";
    private String name;
    private String value;
}
    `;
    const result = parseJavaDataModel(source, "ConfigVO.java");
    expect(result).not.toBeNull();
    expect(result!.fields).toHaveLength(2);
    expect(result!.fields[0]!.name).toBe("name");
    expect(result!.fields[1]!.name).toBe("value");
  });

  test("generic type fields", () => {
    const source = `
package com.example;
import lombok.Data;
@Data
public class PageVO {
    private List<String> items;
    private Map<String, Object> metadata;
    private int totalCount;
}
    `;
    const result = parseJavaDataModel(source, "PageVO.java");
    expect(result).not.toBeNull();
    expect(result!.fields).toHaveLength(3);
    expect(result!.fields[0]!.type).toBe("List<String>");
    expect(result!.fields[1]!.type).toBe("Map<String, Object>");
    expect(result!.fields[2]!.type).toBe("int");
  });
});
