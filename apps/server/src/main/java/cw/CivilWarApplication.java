package cw;

import java.util.Arrays;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CivilWarApplication {
    public static void main(String[] args) {
        if (Arrays.asList(args).contains("admin:code")) {
            throw new IllegalArgumentException("관리자 코드 발급 명령은 더 이상 지원하지 않습니다. 웹 로그인 화면을 사용하세요.");
        }
        SpringApplication.run(CivilWarApplication.class, args);
    }
}
