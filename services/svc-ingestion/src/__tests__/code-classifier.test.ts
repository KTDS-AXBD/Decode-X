import { describe, test, expect } from "vitest";
import { classifyJavaFile } from "../parsing/code-classifier.js";

describe("code-classifier", () => {
  test("@RestController -> source_controller", () => {
    expect(classifyJavaFile("Foo.java", "@RestController\npublic class Foo {}")).toBe("source_controller");
  });

  test("@Controller -> source_controller", () => {
    expect(classifyJavaFile("Bar.java", "@Controller\npublic class Bar {}")).toBe("source_controller");
  });

  test("@Service -> source_service", () => {
    expect(classifyJavaFile("Baz.java", "@Service\npublic class Baz {}")).toBe("source_service");
  });

  test("@Entity -> source_vo", () => {
    expect(classifyJavaFile("User.java", "@Entity\npublic class User {}")).toBe("source_vo");
  });

  test("@Configuration -> source_config", () => {
    expect(classifyJavaFile("AppConfig.java", "@Configuration\npublic class AppConfig {}")).toBe("source_config");
  });

  test("filename-based: Controller.java", () => {
    expect(classifyJavaFile("PaymentController.java", "public class PaymentController {}")).toBe("source_controller");
  });

  test("filename-based: VO/DTO/Entity suffixes", () => {
    expect(classifyJavaFile("BalanceVO.java", "public class BalanceVO {}")).toBe("source_vo");
    expect(classifyJavaFile("PaymentDto.java", "public class PaymentDto {}")).toBe("source_vo");
    expect(classifyJavaFile("PaymentDTO.java", "public class PaymentDTO {}")).toBe("source_vo");
    expect(classifyJavaFile("LoginReq.java", "public class LoginReq {}")).toBe("source_vo");
    expect(classifyJavaFile("LoginResponse.java", "public class LoginResponse {}")).toBe("source_vo");
  });

  test("filename-based: Service/ServiceImpl", () => {
    expect(classifyJavaFile("PaymentService.java", "public interface PaymentService {}")).toBe("source_service");
    expect(classifyJavaFile("PaymentServiceImpl.java", "public class PaymentServiceImpl {}")).toBe("source_service");
  });

  test(".sql -> source_ddl", () => {
    expect(classifyJavaFile("schema.sql", "CREATE TABLE ...")).toBe("source_ddl");
  });

  test("unknown file -> source_config", () => {
    expect(classifyJavaFile("Utils.java", "public class Utils {}")).toBe("source_config");
    expect(classifyJavaFile("Constants.java", "public class Constants {}")).toBe("source_config");
  });

  test("annotation takes priority over filename", () => {
    // File named *Controller but has @Service annotation
    expect(classifyJavaFile("FakeController.java", "@Service\npublic class FakeController {}")).toBe("source_service");
  });
});
